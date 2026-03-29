/**
 * lib/dal/alerts.js — Alerts Data Access
 *
 * Table: alerts (created by migration 011)
 * Generates and queries system alerts for landing page.
 */

const { sql } = require('./db');

const alerts = {
  async getUnacknowledged(limit = 20) {
    const db = sql();
    return db`
      SELECT * FROM alerts
      WHERE acknowledged = false
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ${limit}
    `;
  },

  async countByType() {
    const db = sql();
    return db`
      SELECT type, severity, COUNT(*)::int AS count
      FROM alerts WHERE acknowledged = false
      GROUP BY type, severity
      ORDER BY count DESC
    `;
  },

  async acknowledge(id, acknowledgedBy) {
    const db = sql();
    const [row] = await db`
      UPDATE alerts SET acknowledged = true, acknowledged_by = ${acknowledgedBy || 'system'}
      WHERE id = ${id} RETURNING *
    `;
    return row;
  },

  async acknowledgeAll(acknowledgedBy) {
    const db = sql();
    const result = await db`
      UPDATE alerts SET acknowledged = true, acknowledged_by = ${acknowledgedBy || 'system'}
      WHERE acknowledged = false
    `;
    return { count: result.count };
  },

  async create({ type, severity, entityType, entityId, title, message, actionUrl }) {
    const db = sql();
    const [row] = await db`
      INSERT INTO alerts (type, severity, entity_type, entity_id, title, message, action_url)
      VALUES (${type}, ${severity || 'info'}, ${entityType || null}, ${entityId || null},
        ${title}, ${message || null}, ${actionUrl || null})
      RETURNING *
    `;
    return row;
  },

  /**
   * refresh() — scan the database for conditions that should generate alerts.
   * Run after sync, daily, or on-demand from settings page.
   * Idempotent: clears old auto-generated alerts and recreates.
   */
  async refresh() {
    const db = sql();

    // Clear old auto-generated alerts (keep manually created ones)
    await db`DELETE FROM alerts WHERE acknowledged = false AND type IN (
      'payment_overdue', 'payment_due', 'stock_low', 'stockout'
    )`;

    const created = [];

    // 1. Overdue payments
    const overdue = await db`
      SELECT p.id, p.po_id, p.amount, p.due_date, po.mp_name, po.vendor_name
      FROM po_payments p
      JOIN purchase_orders po ON po.id = p.po_id
      WHERE p.status IN ('planned', 'upcoming', 'due') AND p.due_date < NOW()
    `;
    for (const p of overdue) {
      const [row] = await db`
        INSERT INTO alerts (type, severity, entity_type, entity_id, title, message, action_url)
        VALUES ('payment_overdue', 'critical', 'purchase_order', ${p.po_id},
          ${`Payment overdue: $${Math.round(p.amount)} on ${p.po_id}`},
          ${`${p.mp_name || ''} — ${p.vendor_name || ''}. Due ${p.due_date}`},
          ${`/purchase-orders/${p.po_id}`})
        RETURNING *
      `;
      created.push(row);
    }

    // 2. Payments due within 7 days
    const dueSoon = await db`
      SELECT p.id, p.po_id, p.amount, p.due_date, po.mp_name
      FROM po_payments p
      JOIN purchase_orders po ON po.id = p.po_id
      WHERE p.status IN ('planned', 'upcoming') AND p.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    `;
    for (const p of dueSoon) {
      const [row] = await db`
        INSERT INTO alerts (type, severity, entity_type, entity_id, title, message, action_url)
        VALUES ('payment_due', 'warning', 'purchase_order', ${p.po_id},
          ${`Payment due soon: $${Math.round(p.amount)} on ${p.po_id}`},
          ${`${p.mp_name || ''}. Due ${p.due_date}`},
          ${`/purchase-orders/${p.po_id}`})
        RETURNING *
      `;
      created.push(row);
    }

    // 3. Low stock (days_of_stock < 14 and has velocity)
    const lowStock = await db`
      SELECT id, name, total_inventory, days_of_stock, velocity_per_week
      FROM master_products
      WHERE days_of_stock > 0 AND days_of_stock < 14
        AND velocity_per_week > 0
        AND external_ids IS NOT NULL
    `;
    for (const mp of lowStock) {
      const [row] = await db`
        INSERT INTO alerts (type, severity, entity_type, entity_id, title, message, action_url)
        VALUES ('stock_low', 'warning', 'master_product', ${mp.id},
          ${`Low stock: ${mp.name} — ${mp.days_of_stock}d remaining`},
          ${`${mp.total_inventory} units, ${mp.velocity_per_week}/wk velocity`},
          ${`/products/${mp.id}`})
        RETURNING *
      `;
      created.push(row);
    }

    // 4. Stockout (zero inventory, has velocity = was selling)
    const stockout = await db`
      SELECT id, name, velocity_per_week
      FROM master_products
      WHERE total_inventory = 0
        AND velocity_per_week > 1
        AND external_ids IS NOT NULL
    `;
    for (const mp of stockout) {
      const [row] = await db`
        INSERT INTO alerts (type, severity, entity_type, entity_id, title, message, action_url)
        VALUES ('stockout', 'critical', 'master_product', ${mp.id},
          ${`Stockout: ${mp.name}`},
          ${`Was selling ${mp.velocity_per_week}/wk. Zero inventory.`},
          ${`/products/${mp.id}`})
        RETURNING *
      `;
      created.push(row);
    }

    return { refreshed: true, created: created.length };
  },
};

module.exports = alerts;
