/**
 * lib/dal/dashboard.js — Dashboard Data Access Layer
 */

const { sql } = require('./db');

const dashboard = {
  async getHealth() {
    const db = sql();
    const [r] = await db`
      SELECT 
        (SELECT COUNT(*)::int FROM master_products) AS products,
        (SELECT COUNT(*)::int FROM vendors) AS vendors,
        (SELECT COUNT(*)::int FROM purchase_orders WHERE stage NOT IN ('received', 'distribution')) AS active_pos,
        (SELECT COUNT(*)::int FROM po_payments WHERE status IN ('due', 'overdue')) AS payments_due,
        (SELECT COUNT(*)::int FROM shipments WHERE status != 'delivered') AS shipments
    `;
    return r;
  },

  async getSetting(key) {
    const db = sql();
    const [r] = await db`SELECT value FROM app_settings WHERE key = ${key}`;
    return r ? r.value : null;
  },

  async getSettings(keys) {
    const db = sql();
    const rows = await db`SELECT key, value FROM app_settings WHERE key = ANY(${keys})`;
    const result = {};
    for (const r of rows) result[r.key] = r.value;
    return result;
  },

  async setSetting(key, value) {
    const db = sql();
    await db`
      INSERT INTO app_settings (key, value) VALUES (${key}, ${JSON.stringify(value)})
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}, updated_at = NOW()
    `;
    return { key, value };
  },

  // ── Audit log ────────────────────────────────────────────
  async audit(entityType, entityId, action, changes, performedBy) {
    const db = sql();
    await db`
      INSERT INTO audit_log (entity_type, entity_id, action, changes, performed_by)
      VALUES (${entityType}, ${entityId}, ${action}, ${JSON.stringify(changes)}, ${performedBy || null})
    `;
  },

  // ── Shipment creation (from event handler) ───────────────
  async createShipment({ id, poId, container, vessel, origin, etd, eta }) {
    const db = sql();
    await db`
      INSERT INTO shipments (id, po_id, container, vessel, origin, etd, eta, status)
      VALUES (${id}, ${poId}, ${container}, ${vessel}, ${origin || 'China'}, ${etd}, ${eta}, 'in_transit')
      ON CONFLICT (id) DO NOTHING
    `;
  },
};

module.exports = dashboard;
