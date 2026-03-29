/**
 * lib/dal/logistics.js — Data Access for logistics tables
 * 
 * Tables: receiving_log, transfers, van_routes, bin_locations
 * All SQL for physical movement operations lives here.
 */

const { sql } = require('./db');

// ── Receiving ─────────────────────────────────────────────

const receiving = {
  async getQueue() {
    const db = sql();
    return db`
      SELECT r.*, s.container, s.vessel, s.eta, po.mp_name, po.vendor_name
      FROM receiving_log r
      LEFT JOIN shipments s ON s.id = r.shipment_id
      LEFT JOIN purchase_orders po ON po.id = r.po_id
      WHERE r.status IN ('pending', 'in_progress')
      ORDER BY r.created_at ASC
    `;
  },

  async start(id, receivedBy) {
    const db = sql();
    const [updated] = await db`
      UPDATE receiving_log SET status = 'in_progress', received_by = ${receivedBy}, started_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return updated;
  },

  async complete(id, receivedItems, discrepancies) {
    const db = sql();
    const [updated] = await db`
      UPDATE receiving_log SET
        status = ${discrepancies?.length > 0 ? 'disputed' : 'complete'},
        received_items = ${JSON.stringify(receivedItems)},
        discrepancies = ${JSON.stringify(discrepancies || [])},
        completed_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return updated;
  },

  async createFromPO(poId, shipmentId, expectedItems) {
    const db = sql();
    const id = `RCV-${Date.now().toString(36).toUpperCase()}`;
    const [created] = await db`
      INSERT INTO receiving_log (id, po_id, shipment_id, expected_items, status)
      VALUES (${id}, ${poId}, ${shipmentId}, ${JSON.stringify(expectedItems)}, 'pending')
      RETURNING *
    `;
    return created;
  },
};

// ── Transfers ─────────────────────────────────────────────

const transfers = {
  async getAll() {
    const db = sql();
    return db`SELECT * FROM transfers ORDER BY created_at DESC`;
  },

  async getPending() {
    const db = sql();
    return db`SELECT * FROM transfers WHERE status IN ('planned', 'picked') ORDER BY created_at ASC`;
  },

  async getForStore(store) {
    const db = sql();
    return db`
      SELECT * FROM transfers
      WHERE to_location = ${store} AND status IN ('in_transit', 'delivered')
      ORDER BY created_at DESC
    `;
  },

  async getUnconfirmed() {
    const db = sql();
    return db`
      SELECT * FROM transfers
      WHERE status = 'delivered' AND confirmed_at IS NULL
      ORDER BY delivered_at ASC
    `;
  },

  async create({ fromLocation, toLocation, items, createdBy }) {
    const db = sql();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const id = `TR-${new Date().toISOString().slice(5, 10).replace('-', '')}-${rand}`;
    const totalUnits = items.reduce((s, i) => s + (i.qty || 0), 0);

    const [created] = await db`
      INSERT INTO transfers (id, from_location, to_location, items, total_units, status, created_by)
      VALUES (${id}, ${fromLocation}, ${toLocation}, ${JSON.stringify(items)}, ${totalUnits}, 'planned', ${createdBy})
      RETURNING *
    `;
    return created;
  },

  async advanceStatus(id, { status, by }) {
    const db = sql();
    const VALID = ['picked', 'loaded', 'in_transit', 'delivered', 'confirmed'];
    if (!VALID.includes(status)) throw new Error(`Invalid transfer status: ${status}`);

    let updated;
    switch (status) {
      case 'picked':
        [updated] = await db`UPDATE transfers SET status = 'picked', picked_by = ${by || null}, picked_at = NOW() WHERE id = ${id} RETURNING *`;
        break;
      case 'loaded':
        [updated] = await db`UPDATE transfers SET status = 'loaded', loaded_at = NOW() WHERE id = ${id} RETURNING *`;
        break;
      case 'in_transit':
        [updated] = await db`UPDATE transfers SET status = 'in_transit', departed_at = NOW() WHERE id = ${id} RETURNING *`;
        break;
      case 'delivered':
        [updated] = await db`UPDATE transfers SET status = 'delivered', delivered_at = NOW() WHERE id = ${id} RETURNING *`;
        break;
      case 'confirmed':
        [updated] = await db`UPDATE transfers SET status = 'confirmed', confirmed_by = ${by || null}, confirmed_at = NOW() WHERE id = ${id} RETURNING *`;
        break;
    }
    return updated;
  },

  async confirm(id, confirmedBy) {
    const db = sql();
    const [updated] = await db`
      UPDATE transfers SET status = 'confirmed', confirmed_by = ${confirmedBy}, confirmed_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return updated;
  },
};

// ── Van Routes ────────────────────────────────────────────

const vanRoutes = {
  async getForDate(date) {
    const db = sql();
    return db`SELECT * FROM van_routes WHERE route_date = ${date} ORDER BY created_at DESC`;
  },

  async getActive() {
    const db = sql();
    return db`SELECT * FROM van_routes WHERE status IN ('planned', 'loading', 'departed') ORDER BY route_date ASC`;
  },

  async create({ date, driver, stops }) {
    const db = sql();
    const rand = Math.random().toString(36).slice(2, 4).toUpperCase();
    const id = `VR-${date.replace(/-/g, '').slice(4)}-${rand}`;
    const totalUnits = stops.reduce((s, stop) => s + (stop.units || 0), 0);

    const [created] = await db`
      INSERT INTO van_routes (id, route_date, driver, stops, total_units, total_transfers, status)
      VALUES (${id}, ${date}, ${driver}, ${JSON.stringify(stops)}, ${totalUnits}, ${stops.length}, 'planned')
      RETURNING *
    `;
    return created;
  },

  async depart(id) {
    const db = sql();
    const [updated] = await db`UPDATE van_routes SET status = 'departed', departed_at = NOW() WHERE id = ${id} RETURNING *`;
    return updated;
  },

  async complete(id) {
    const db = sql();
    const [updated] = await db`UPDATE van_routes SET status = 'completed', completed_at = NOW() WHERE id = ${id} RETURNING *`;
    return updated;
  },
};

// ── Bins ──────────────────────────────────────────────────

const bins = {
  async getAll() {
    const db = sql();
    return db`SELECT * FROM bin_locations ORDER BY id`;
  },

  async getByZone(zone) {
    const db = sql();
    return db`SELECT * FROM bin_locations WHERE zone = ${zone} ORDER BY id`;
  },

  async getEmpty() {
    const db = sql();
    return db`SELECT * FROM bin_locations WHERE current_qty = 0 OR sku IS NULL ORDER BY id`;
  },

  async findBySku(sku) {
    const db = sql();
    return db`SELECT * FROM bin_locations WHERE sku = ${sku}`;
  },

  async assign(binId, { sku, mpId, qty }) {
    const db = sql();
    const [updated] = await db`
      UPDATE bin_locations SET sku = ${sku}, mp_id = ${mpId}, current_qty = ${qty}
      WHERE id = ${binId} RETURNING *
    `;
    return updated;
  },

  async clear(binId) {
    const db = sql();
    const [updated] = await db`
      UPDATE bin_locations SET sku = NULL, mp_id = NULL, current_qty = 0
      WHERE id = ${binId} RETURNING *
    `;
    return updated;
  },
};

// ── Dashboard aggregates ─────────────────────────────────

async function getDashboard() {
  const db = sql();
  const [incoming, pendingTransfers, unconfirmed, activeRoutes] = await Promise.all([
    db`SELECT COUNT(*)::int AS n FROM receiving_log WHERE status IN ('pending', 'in_progress')`,
    db`SELECT COUNT(*)::int AS n FROM transfers WHERE status IN ('planned', 'picked')`,
    db`SELECT COUNT(*)::int AS n FROM transfers WHERE status = 'delivered' AND confirmed_at IS NULL`,
    db`SELECT COUNT(*)::int AS n FROM van_routes WHERE status IN ('planned', 'loading', 'departed')`,
  ]);

  return {
    receivingQueue: incoming[0].n,
    pendingTransfers: pendingTransfers[0].n,
    unconfirmedDeliveries: unconfirmed[0].n,
    activeRoutes: activeRoutes[0].n,
  };
}

module.exports = { receiving, transfers, vanRoutes, bins, getDashboard };
