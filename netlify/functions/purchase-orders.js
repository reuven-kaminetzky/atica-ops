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

// ── PO Stages (matches Deshawn's gate system) ───────────────

const STAGES = [
  'Concept',      // 1
  'Design',       // 2
  'Sample',       // 3
  'Approved',     // 4
  'Ordered',      // 5
  'Production',   // 6
  'Shipped',      // 7
  'Received',     // 8
  'Distribution', // 9
];

function stageIndex(name) {
  const idx = STAGES.findIndex(s => s.toLowerCase() === (name || '').toLowerCase());
  return idx >= 0 ? idx : -1;
}

// ── Validation ──────────────────────────────────────────────

function validatePO(data, partial = false) {
  const errors = [];

  if (!partial) {
    if (!data.vendor || typeof data.vendor !== 'string') errors.push('vendor is required');
    if (!data.product || typeof data.product !== 'string') errors.push('product is required');
  }

  if (data.totalCost !== undefined && (typeof data.totalCost !== 'number' || data.totalCost < 0)) {
    errors.push('totalCost must be a non-negative number');
  }
  if (data.totalUnits !== undefined && (!Number.isInteger(data.totalUnits) || data.totalUnits < 0)) {
    errors.push('totalUnits must be a non-negative integer');
  }
  if (data.stage !== undefined && stageIndex(data.stage) < 0) {
    errors.push(`stage must be one of: ${STAGES.join(', ')}`);
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

  const id = body.id || generateId();
  const now = new Date().toISOString();

  const po = {
    id,
    vendor:     body.vendor,
    product:    body.product,
    styles:     body.styles || [],
    stage:      body.stage || 'Concept',
    stageIndex: stageIndex(body.stage || 'Concept') + 1,
    totalCost:  body.totalCost || 0,
    totalUnits: body.totalUnits || 0,
    etd:        body.etd || null,
    payments:   body.payments || [],
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
  const allowed = ['vendor', 'product', 'styles', 'totalCost', 'totalUnits', 'etd', 'payments', 'notes', 'tags'];
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await store.po.put(id, updated);
  return { updated: true, purchaseOrder: updated };
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

  // Only allow advancing forward by one step (matches Deshawn's gate logic)
  if (targetIdx !== currentIdx + 1) {
    throw new RouteError(400,
      `Cannot jump from "${existing.stage}" (${currentIdx + 1}) to "${targetStage}" (${targetIdx + 1}). ` +
      `Must advance one stage at a time.`
    );
  }

  // Stage-specific gate checks (server-side mirror of _checkStageGate)
  const gates = {
    'Sample':       () => { if (!existing.vendor) throw new RouteError(400, 'Gate: vendor required before Sample'); },
    'Approved':     () => { if (!existing.styles || existing.styles.length === 0) throw new RouteError(400, 'Gate: at least one style required before Approved'); },
    'Ordered':      () => { if (!existing.totalCost || existing.totalCost <= 0) throw new RouteError(400, 'Gate: totalCost must be set before Ordered'); },
    'Production':   () => { if (!existing.totalUnits || existing.totalUnits <= 0) throw new RouteError(400, 'Gate: totalUnits must be set before Production'); },
    'Shipped':      () => { if (!existing.etd) throw new RouteError(400, 'Gate: ETD required before Shipped'); },
    'Distribution': () => { /* final stage — no gate */ },
  };

  if (gates[targetStage]) gates[targetStage]();

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    stage:      targetStage,
    stageIndex: targetIdx + 1,
    updatedAt:  now,
    history:    [...(existing.history || []), { action: 'stage_advanced', from: existing.stage, to: targetStage, at: now }],
  };

  await store.po.put(id, updated);
  return { advanced: true, purchaseOrder: updated };
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
  { method: 'GET',    path: ':id',         handler: getPO,        noClient: true },
  { method: 'POST',   path: '',            handler: createPO,     noClient: true },
  { method: 'PATCH',  path: ':id',         handler: updatePO,     noClient: true },
  { method: 'PATCH',  path: ':id/stage',   handler: advanceStage, noClient: true },
  { method: 'DELETE', path: ':id',         handler: deletePO,     noClient: true },
];

exports.handler = createHandler(ROUTES, 'purchase-orders');
