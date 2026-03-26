/**
 * /api/purchase-orders/* — Purchase Order CRUD
 * Owner: Oboosu (infra), consumed by Deshawn (cash flow)
 * 
 * Server-side PO storage using Netlify Blobs.
 * Replaces localStorage — data persists across browsers and deploys.
 * 
 * Routes:
 *   GET    /api/purchase-orders              → list all POs
 *   GET    /api/purchase-orders/:id          → get single PO
 *   POST   /api/purchase-orders              → create PO
 *   PATCH  /api/purchase-orders/:id          → update PO
 *   PATCH  /api/purchase-orders/:id/stage    → advance stage (uses _checkStageGate logic)
 *   DELETE /api/purchase-orders/:id          → delete PO
 */

const { createHandler, RouteError } = require('../../lib/handler');
const store = require('../../lib/store');
const { MP_BY_ID } = require('../../lib/products');

// ── PO Stages (aligned with PLM check-in gates) ────────────
// PD = Product Development sign-off
// FIN = Finance sign-off

const STAGES = [
  { name: 'Concept',      gate: null,   desc: 'Initial product idea' },
  { name: 'Design',       gate: 'pd',   desc: 'PD reviews design brief' },
  { name: 'Sample',       gate: null,   desc: 'Sample ordered from vendor' },
  { name: 'Approved',     gate: 'pd',   desc: 'PD approves sample quality' },
  { name: 'Costed',       gate: 'fin',  desc: 'Finance approves cost/margin' },
  { name: 'Ordered',      gate: null,   desc: 'PO placed with vendor' },
  { name: 'Production',   gate: null,   desc: 'Factory producing' },
  { name: 'QC',           gate: 'pd',   desc: 'PD inspects production quality' },
  { name: 'Shipped',      gate: null,   desc: 'Left factory' },
  { name: 'In Transit',   gate: null,   desc: 'On vessel/container' },
  { name: 'Received',     gate: 'fin',  desc: 'Finance confirms receipt + payment' },
  { name: 'Distribution', gate: null,   desc: 'Distributed to stores' },
];

const STAGE_NAMES = STAGES.map(s => s.name);

function stageIndex(name) {
  return STAGE_NAMES.findIndex(s => s.toLowerCase() === (name || '').toLowerCase());
}

// ── Validation ──────────────────────────────────────────────

function validatePO(data, partial = false) {
  const errors = [];

  if (!partial) {
    if (!data.mpId && !data.vendor) errors.push('mpId or vendor required');
  }

  if (data.fob !== undefined && (typeof data.fob !== 'number' || data.fob < 0)) {
    errors.push('fob must be a non-negative number');
  }
  if (data.units !== undefined && (!Number.isInteger(data.units) || data.units < 0)) {
    errors.push('units must be a non-negative integer');
  }
  if (data.stage !== undefined && stageIndex(data.stage) < 0) {
    errors.push(`stage must be one of: ${STAGE_NAMES.join(', ')}`);
  }
  if (data.etd !== undefined && data.etd !== null && isNaN(Date.parse(data.etd))) {
    errors.push('etd must be a valid date string');
  }
  if (data.styles !== undefined && !Array.isArray(data.styles)) {
    errors.push('styles must be an array');
  }
  if (data.payments !== undefined && !Array.isArray(data.payments)) {
    errors.push('payments must be an array');
  }

  if (errors.length > 0) {
    throw new RouteError(400, `Validation failed: ${errors.join('; ')}`);
  }
}

// ── ID generation ───────────────────────────────────────────

function generateId() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${year}${month}-${rand}`;
}

// ── Handlers ────────────────────────────────────────────────

async function listPOs() {
  const all = await store.po.getAll();
  // Sort by creation date descending
  all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { count: all.length, purchaseOrders: all };
}

async function getPO(client, { pathParams }) {
  const id = decodeURIComponent(pathParams.id);
  const po = await store.po.get(id);
  if (!po) throw new RouteError(404, `PO not found: ${id}`);
  return po;
}

async function createPO(client, { body }) {
  validatePO(body);

  // Auto-populate from MP seed if mpId provided
  const seed = body.mpId ? MP_BY_ID[body.mpId] : null;
  const id = body.id || generateId();
  const now = new Date().toISOString();

  const po = {
    id,
    // MP link
    mpId:       body.mpId || null,
    mpName:     seed?.name || body.mpName || body.product || null,
    mpCode:     seed?.code || body.mpCode || null,
    cat:        seed?.cat || body.cat || null,
    // Sourcing (from seed or body)
    vendor:     body.vendor || seed?.vendor || '',
    fob:        body.fob ?? seed?.fob ?? 0,
    units:      body.units ?? body.totalUnits ?? 0,
    moq:        seed?.moq || body.moq || 0,
    lead:       seed?.lead || body.lead || 0,
    // Customs
    hts:        seed?.hts || body.hts || null,
    duty:       seed?.duty || body.duty || 0,
    // Computed
    fobTotal:   +(( body.fob ?? seed?.fob ?? 0) * (body.units ?? body.totalUnits ?? 0)).toFixed(2),
    landedCost: seed ? +((body.fob ?? seed.fob) * (1 + (seed.duty || 0) / 100)).toFixed(2) : null,
    // Styles / sizing
    styles:     body.styles || [],
    sizes:      body.sizes || seed?.sizes || null,
    fits:       body.fits || seed?.fits || [],
    // Stage system
    stage:      body.stage || 'Concept',
    stageIndex: stageIndex(body.stage || 'Concept') + 1,
    // Check-ins — PD and Finance sign-offs
    checkIns: {
      pd:  [],   // [{ stage, by, at, notes }]
      fin: [],   // [{ stage, by, at, notes }]
    },
    // Logistics
    etd:        body.etd || null,
    eta:        body.eta || null,
    container:  body.container || null,
    vessel:     body.vessel || null,
    // Financial
    payments:   body.payments || [],
    // Meta
    notes:      body.notes || '',
    tags:       body.tags || [],
    createdAt:  now,
    updatedAt:  now,
    history:    [{ action: 'created', stage: 'Concept', at: now }],
  };

  await store.po.put(id, po);
  return { created: true, purchaseOrder: po };
}

async function updatePO(client, { pathParams, body }) {
  const id = decodeURIComponent(pathParams.id);
  const existing = await store.po.get(id);
  if (!existing) throw new RouteError(404, `PO not found: ${id}`);

  validatePO(body, true);

  // Merge — only update fields that are present in body
  const updates = {};
  const allowed = ['vendor', 'mpId', 'mpName', 'mpCode', 'cat', 'fob', 'units', 'moq', 'lead',
                   'hts', 'duty', 'styles', 'sizes', 'fits', 'etd', 'eta', 'container', 'vessel',
                   'payments', 'notes', 'tags'];
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Recompute totals if fob or units changed
  const fob   = updates.fob   ?? existing.fob   ?? 0;
  const units = updates.units ?? existing.units ?? 0;
  const duty  = updates.duty  ?? existing.duty  ?? 0;
  updates.fobTotal   = +(fob * units).toFixed(2);
  updates.landedCost = +(fob * (1 + duty / 100)).toFixed(2);

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await store.po.put(id, updated);
  return { updated: true, purchaseOrder: updated };
}

async function getStages() {
  return { stages: STAGES };
}

async function advanceStage(client, { pathParams, body }) {
  const id = decodeURIComponent(pathParams.id);
  const existing = await store.po.get(id);
  if (!existing) throw new RouteError(404, `PO not found: ${id}`);

  const currentIdx = stageIndex(existing.stage);
  const targetStage = body.stage;

  if (!targetStage) throw new RouteError(400, 'stage is required in body');

  const targetIdx = stageIndex(targetStage);
  if (targetIdx < 0) throw new RouteError(400, `Invalid stage: ${targetStage}`);

  // Only allow advancing forward by one step
  if (targetIdx !== currentIdx + 1) {
    throw new RouteError(400,
      `Cannot jump from "${existing.stage}" (${currentIdx + 1}) to "${targetStage}" (${targetIdx + 1}). ` +
      `Must advance one stage at a time.`
    );
  }

  // Stage gate checks — what's needed before each transition
  const targetDef = STAGES[targetIdx];

  // Data completeness gates
  const gates = {
    'Design':       () => { if (!existing.vendor) throw new RouteError(400, 'Gate: vendor required before Design'); },
    'Sample':       () => { if (!existing.mpId && !existing.mpName) throw new RouteError(400, 'Gate: product (mpId or mpName) required before Sample'); },
    'Costed':       () => {
      if (!existing.fob || existing.fob <= 0) throw new RouteError(400, 'Gate: FOB cost must be set before Costed');
      if (!existing.units || existing.units <= 0) throw new RouteError(400, 'Gate: units must be set before Costed');
    },
    'Ordered':      () => { if (!existing.fobTotal || existing.fobTotal <= 0) throw new RouteError(400, 'Gate: fobTotal must be set before Ordered'); },
    'Shipped':      () => { if (!existing.etd) throw new RouteError(400, 'Gate: ETD required before Shipped'); },
    'In Transit':   () => { if (!existing.container && !existing.vessel) throw new RouteError(400, 'Gate: container or vessel required before In Transit'); },
  };

  if (gates[targetStage]) gates[targetStage]();

  // PD/Finance check-in requirement
  if (targetDef.gate === 'pd') {
    if (!body.checkedBy) throw new RouteError(400, `Gate: PD check-in required for "${targetStage}". Pass checkedBy in body.`);
  }
  if (targetDef.gate === 'fin') {
    if (!body.checkedBy) throw new RouteError(400, `Gate: Finance check-in required for "${targetStage}". Pass checkedBy in body.`);
  }

  const now = new Date().toISOString();
  const checkIns = existing.checkIns || { pd: [], fin: [] };

  // Record check-in
  if (targetDef.gate && body.checkedBy) {
    const checkIn = {
      stage: targetStage,
      by: body.checkedBy,
      at: now,
      notes: body.checkNotes || '',
      type: targetDef.gate,
    };
    if (targetDef.gate === 'pd') checkIns.pd.push(checkIn);
    if (targetDef.gate === 'fin') checkIns.fin.push(checkIn);
  }

  const updated = {
    ...existing,
    stage:      targetStage,
    stageIndex: targetIdx + 1,
    checkIns,
    updatedAt:  now,
    history:    [...(existing.history || []), {
      action: 'stage_advanced',
      from: existing.stage,
      to: targetStage,
      at: now,
      ...(body.checkedBy ? { checkedBy: body.checkedBy, checkType: targetDef.gate } : {}),
    }],
  };

  await store.po.put(id, updated);

  // Auto-create shipment when PO hits "In Transit"
  let shipment = null;
  if (targetStage === 'In Transit') {
    try {
      const shipData = {
        id: 'SHIP-' + Date.now().toString(36).toUpperCase(),
        poId: id,
        poNum: id,
        mpId: existing.mpId || null,
        mpName: existing.mpName || null,
        vendor: existing.vendor || null,
        container: existing.container || null,
        vessel: existing.vessel || null,
        etd: existing.etd || null,
        eta: existing.eta || null,
        units: existing.units || 0,
        fobTotal: existing.fobTotal || 0,
        status: 'in-transit',
        createdAt: now,
        updatedAt: now,
        arrivedAt: null,
        events: [{ type: 'created', date: now, note: `Auto-created from PO ${id} stage advance` }],
      };
      await store.shipments.put(shipData.id, shipData);
      shipment = shipData;
    } catch (e) {
      console.error(`[purchase-orders] Failed to auto-create shipment for ${id}:`, e.message);
    }
  }

  return { advanced: true, purchaseOrder: updated, gate: targetDef, shipment };
}

async function deletePO(client, { pathParams }) {
  const id = decodeURIComponent(pathParams.id);
  const existing = await store.po.get(id);
  if (!existing) throw new RouteError(404, `PO not found: ${id}`);

  await store.po.delete(id);
  return { deleted: true, id };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',    path: '',            handler: listPOs,      noClient: true },
  { method: 'GET',    path: 'stages',      handler: getStages,    noClient: true },
  { method: 'GET',    path: ':id',         handler: getPO,        noClient: true },
  { method: 'POST',   path: '',            handler: createPO,     noClient: true },
  { method: 'PATCH',  path: ':id',         handler: updatePO,     noClient: true },
  { method: 'PATCH',  path: ':id/stage',   handler: advanceStage, noClient: true },
  { method: 'DELETE', path: ':id',         handler: deletePO,     noClient: true },
];

exports.handler = createHandler(ROUTES, 'purchase-orders');
