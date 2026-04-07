/**
 * lib/dal/dashboard.js — Dashboard Data Access Layer
 */

const { sql } = require('./db');

const dashboard = {
  async getHealth() {
    const db = sql();
    const result = { products: 0, vendors: 0, active_pos: 0, payments_due: 0, shipments: 0 };
    try { const [r] = await db`SELECT COUNT(*)::int AS n FROM master_products`; result.products = r.n; } catch {}
    try { const [r] = await db`SELECT COUNT(*)::int AS n FROM vendors`; result.vendors = r.n; } catch {}
    try { const [r] = await db`SELECT COUNT(*)::int AS n FROM purchase_orders WHERE stage NOT IN ('received', 'distribution')`; result.active_pos = r.n; } catch {}
    try { const [r] = await db`SELECT COUNT(*)::int AS n FROM po_payments WHERE status IN ('due', 'overdue')`; result.payments_due = r.n; } catch {}
    try { const [r] = await db`SELECT COUNT(*)::int AS n FROM shipments WHERE status != 'delivered'`; result.shipments = r.n; } catch {}
    return result;
  },

  async getOperationalSummary() {
    const db = sql();

    // Inventory value + totals
    const [inv] = await db`
      SELECT 
        COUNT(*)::int AS total_mps,
        COUNT(*) FILTER (WHERE hero_image IS NOT NULL)::int AS linked_mps,
        COUNT(*) FILTER (WHERE hero_image IS NOT NULL)::int AS with_images,
        COALESCE(SUM(total_inventory), 0)::int AS total_units,
        ROUND(COALESCE(SUM(total_inventory * fob), 0))::int AS inventory_cost_value,
        ROUND(COALESCE(SUM(total_inventory * retail), 0))::int AS inventory_retail_value,
        COUNT(*) FILTER (WHERE total_inventory = 0 AND hero_image IS NOT NULL)::int AS out_of_stock,
        COUNT(*) FILTER (WHERE days_of_stock < 30 AND days_of_stock > 0)::int AS low_stock,
        COUNT(*) FILTER (WHERE signal = 'hot')::int AS hot_products,
        COUNT(*) FILTER (WHERE signal = 'slow')::int AS slow_products
      FROM master_products
    `;

    // Top velocity products
    const topVelocity = await db`
      SELECT id, name, category, velocity_per_week, total_inventory, signal, hero_image
      FROM master_products 
      WHERE velocity_per_week > 0
      ORDER BY velocity_per_week DESC
      LIMIT 5
    `;

    // PO pipeline
    let pipeline = [];
    try {
      pipeline = await db`
        SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(fob_total), 0)::numeric AS value
        FROM purchase_orders GROUP BY stage
      `;
    } catch { /* table or column might not exist */ }

    // Payments due soon
    let paymentsDue = [];
    try {
      paymentsDue = await db`
        SELECT p.id, p.po_id, p.type, p.label, p.amount, p.status, p.due_date,
          po.mp_name, po.vendor_name
        FROM po_payments p
        JOIN purchase_orders po ON po.id = p.po_id
        WHERE p.status IN ('due', 'overdue', 'upcoming')
        ORDER BY p.due_date ASC NULLS LAST
        LIMIT 10
      `;
    } catch { /* table might not exist */ }

    // Stock alerts (out of stock or critically low)
    let stockAlerts = [];
    try {
      stockAlerts = await db`
        SELECT id, name, category, total_inventory, days_of_stock, velocity_per_week, signal
        FROM master_products
        WHERE (total_inventory = 0 OR days_of_stock < 30)
          AND hero_image IS NOT NULL
          AND velocity_per_week > 0
        ORDER BY days_of_stock ASC
        LIMIT 10
      `;
    } catch { /* column might not exist */ }

    // Last sync timestamp
    let lastSync = null;
    try {
      const [syncSetting] = await db`SELECT value FROM app_settings WHERE key = 'last_sync'`;
      if (syncSetting?.value) lastSync = typeof syncSetting.value === 'string' ? JSON.parse(syncSetting.value) : syncSetting.value;
    } catch { /* ok */ }

    return { inventory: inv, topVelocity, pipeline, paymentsDue, stockAlerts, lastSync };
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
