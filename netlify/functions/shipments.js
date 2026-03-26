/**
 * /api/shipments/* — Shipment tracking (persistent via Netlify Blobs)
 * Owner: Stallon (API layer)
 * 
 * Backed by lib/store.js → Netlify Blobs. Survives cold starts.
 * When a PO hits stage 6, frontend calls POST /api/shipments.
 *
 * Routes:
 *   GET  /api/shipments             → list all shipments
 *   GET  /api/shipments/:id         → single shipment
 *   POST /api/shipments             → create from PO data
 *   PATCH /api/shipments/:id        → update status/ETA/container
 *   POST /api/shipments/:id/arrive  → mark arrived + inventory adjust
 */

const { createHandler, RouteError, validate } = require('../../lib/handler');
const cache = require('../../lib/cache');
const store = require('../../lib/store');

// ── Handlers ────────────────────────────────────────────────

async function listShipments(client, { params }) {
  const all = await store.shipments.getAll();
  let result = all;
  if (params.status && params.status !== 'all') {
    result = result.filter(s => s.status === params.status);
  }
  result.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { count: result.length, shipments: result };
}

async function getShipment(client, { pathParams }) {
  const shipment = await store.shipments.get(pathParams.id);
  if (!shipment) throw new RouteError(404, 'Shipment not found');
  return shipment;
}

async function createShipment(client, { body }) {
  const { poId, poNum, mpId, mpName, vendor, container, vessel, etd, eta, units, fobTotal } = body;
  if (!poId) throw new RouteError(400, 'poId required');

  // Check for existing in-transit shipment for this PO
  const all = await store.shipments.getAll();
  const existing = all.find(s => s.poId === poId && s.status === 'in-transit');
  if (existing) {
    return { created: false, existing: true, shipment: existing, message: 'Shipment already exists for this PO' };
  }

  const id = 'SHIP-' + Date.now().toString(36).toUpperCase();
  const shipment = {
    id, poId,
    poNum:     poNum || null,
    mpId:      mpId || null,
    mpName:    mpName || null,
    vendor:    vendor || null,
    container: container || null,
    vessel:    vessel || null,
    etd:       etd || null,
    eta:       eta || null,
    units:     units || 0,
    fobTotal:  fobTotal || 0,
    status:    'in-transit',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    arrivedAt: null,
    events: [{ type: 'created', date: new Date().toISOString(), note: 'PO advanced to in-transit' }],
  };

  await store.shipments.put(id, shipment);
  return { created: true, shipment };
}

async function updateShipment(client, { pathParams, body }) {
  const shipment = await store.shipments.get(pathParams.id);
  if (!shipment) throw new RouteError(404, 'Shipment not found');

  const updatable = ['container', 'vessel', 'etd', 'eta', 'status', 'units'];
  const changes = [];

  for (const key of updatable) {
    if (body[key] !== undefined && body[key] !== shipment[key]) {
      changes.push(`${key}: ${shipment[key]} → ${body[key]}`);
      shipment[key] = body[key];
    }
  }

  if (changes.length > 0) {
    shipment.updatedAt = new Date().toISOString();
    (shipment.events ||= []).push({
      type: 'updated', date: new Date().toISOString(),
      note: 'Updated: ' + changes.join(', '),
    });
    await store.shipments.put(shipment.id, shipment);
  }

  return { updated: changes.length > 0, changes, shipment };
}

async function arriveShipment(client, { pathParams, body }) {
  const shipment = await store.shipments.get(pathParams.id);
  if (!shipment) throw new RouteError(404, 'Shipment not found');

  if (shipment.status === 'arrived') {
    return { arrived: false, message: 'Already marked as arrived', shipment };
  }

  shipment.status = 'arrived';
  shipment.arrivedAt = new Date().toISOString();
  shipment.updatedAt = new Date().toISOString();
  (shipment.events ||= []).push({
    type: 'arrived', date: new Date().toISOString(),
    note: body.note || 'Shipment arrived',
  });

  // Inventory adjustments if provided
  const adjustResults = [];
  if (body.adjustments && Array.isArray(body.adjustments)) {
    for (const adj of body.adjustments) {
      try {
        const result = await client.adjustInventory(adj.inventoryItemId, adj.locationId, adj.adjustment);
        adjustResults.push({ ...adj, success: true, level: result.inventory_level });
      } catch (err) {
        adjustResults.push({ ...adj, success: false, error: err.message });
      }
    }
    cache.set(cache.makeKey('inventory', {}), null, 0);
  }

  await store.shipments.put(shipment.id, shipment);
  return { arrived: true, shipment, inventoryAdjustments: adjustResults };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: '',           handler: listShipments,  noClient: true },
  { method: 'GET',   path: ':id',        handler: getShipment,    noClient: true },
  { method: 'POST',  path: '',           handler: createShipment, noClient: true },
  { method: 'PATCH', path: ':id',        handler: updateShipment, noClient: true },
  { method: 'POST',  path: ':id/arrive', handler: arriveShipment },
];

exports.handler = createHandler(ROUTES, 'shipments');
