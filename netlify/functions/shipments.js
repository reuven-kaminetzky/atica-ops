/**
 * /api/shipments/* — Shipment tracking
 * Owner: Stallon (API layer)
 * 
 * When a PO advances to stage 6 (in-transit), frontend calls
 * POST /api/shipments to create a shipment record with
 * container, vessel, ETD, ETA from the PO data.
 *
 * Routes:
 *   GET  /api/shipments             → list all shipments
 *   GET  /api/shipments/:id         → single shipment
 *   POST /api/shipments             → create from PO data (auto on stage 6)
 *   PATCH /api/shipments/:id        → update status/ETA/container
 *   POST /api/shipments/:id/arrive  → mark arrived + trigger inventory adjust
 */

const { createHandler, RouteError } = require('../../lib/handler');
const cache = require('../../lib/cache');

// In-memory shipment store (persists within lambda container)
// In production this would be a database — for now it supplements
// the PO's stageHistory and localStorage on the frontend.
let _shipments = [];

// ── Handlers ────────────────────────────────────────────────

async function listShipments(client, { params }) {
  const status = params.status; // 'in-transit', 'arrived', 'all'
  let result = _shipments;
  if (status && status !== 'all') {
    result = result.filter(s => s.status === status);
  }
  return { count: result.length, shipments: result };
}

async function getShipment(client, { pathParams }) {
  const id = pathParams.id;
  const shipment = _shipments.find(s => s.id === id);
  if (!shipment) throw new RouteError(404, 'Shipment not found');
  return shipment;
}

async function createShipment(client, { body }) {
  // Required: poId, poNum, container, vessel
  const { poId, poNum, mpId, mpName, vendor, container, vessel, etd, eta, units, fobTotal } = body;
  if (!poId) throw new RouteError(400, 'poId required');

  // Don't create duplicates
  const existing = _shipments.find(s => s.poId === poId && s.status === 'in-transit');
  if (existing) {
    return { created: false, existing: true, shipment: existing, message: 'Shipment already exists for this PO' };
  }

  const shipment = {
    id: 'SHIP-' + Date.now().toString(36).toUpperCase(),
    poId,
    poNum: poNum || null,
    mpId: mpId || null,
    mpName: mpName || null,
    vendor: vendor || null,
    container: container || null,
    vessel: vessel || null,
    etd: etd || null,
    eta: eta || null,
    units: units || 0,
    fobTotal: fobTotal || 0,
    status: 'in-transit',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    arrivedAt: null,
    events: [
      { type: 'created', date: new Date().toISOString(), note: 'Shipment created — PO advanced to stage 6' },
    ],
  };

  _shipments.push(shipment);
  console.log(`[Shipments] Created ${shipment.id} for PO ${poNum || poId} — ${container || 'no container'} on ${vessel || 'no vessel'}`);

  return { created: true, shipment };
}

async function updateShipment(client, { pathParams, body }) {
  const id = pathParams.id;
  const idx = _shipments.findIndex(s => s.id === id);
  if (idx === -1) throw new RouteError(404, 'Shipment not found');

  const shipment = _shipments[idx];
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
    shipment.events.push({
      type: 'updated',
      date: new Date().toISOString(),
      note: 'Updated: ' + changes.join(', '),
    });
  }

  return { updated: changes.length > 0, changes, shipment };
}

async function arriveShipment(client, { pathParams, body }) {
  const id = pathParams.id;
  const idx = _shipments.findIndex(s => s.id === id);
  if (idx === -1) throw new RouteError(404, 'Shipment not found');

  const shipment = _shipments[idx];
  if (shipment.status === 'arrived') {
    return { arrived: false, message: 'Already marked as arrived', shipment };
  }

  shipment.status = 'arrived';
  shipment.arrivedAt = new Date().toISOString();
  shipment.updatedAt = new Date().toISOString();
  shipment.events.push({
    type: 'arrived',
    date: new Date().toISOString(),
    note: body.note || 'Shipment arrived',
  });

  // If inventory adjustments are provided, execute them
  // body.adjustments = [{ inventoryItemId, locationId, adjustment }]
  const adjustResults = [];
  if (body.adjustments && Array.isArray(body.adjustments)) {
    for (const adj of body.adjustments) {
      try {
        const result = await client._request('/inventory_levels/adjust.json', {
          method: 'POST',
          body: JSON.stringify({
            inventory_item_id: adj.inventoryItemId,
            location_id: adj.locationId,
            available_adjustment: adj.adjustment,
          }),
        });
        adjustResults.push({ ...adj, success: true, level: result.inventory_level });
      } catch (err) {
        adjustResults.push({ ...adj, success: false, error: err.message });
      }
    }
    // Invalidate inventory cache
    cache.set(cache.makeKey('inventory', {}), null, 0);
  }

  console.log(`[Shipments] ${shipment.id} arrived — ${adjustResults.length} inventory adjustments`);

  return {
    arrived: true,
    shipment,
    inventoryAdjustments: adjustResults,
  };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: '',          handler: listShipments },
  { method: 'GET',   path: ':id',       handler: getShipment },
  { method: 'POST',  path: '',          handler: createShipment },
  { method: 'PATCH', path: ':id',       handler: updateShipment },
  { method: 'POST',  path: ':id/arrive', handler: arriveShipment },
];

exports.handler = createHandler(ROUTES, 'shipments');
