/**
 * lib/dal/orders.js — Orders Data Access Layer
 * 
 * Proper order-level entity. The sales table is order_lines.
 * orders table links to customers and locations.
 * 
 * Sprint 3 — docs/SPRINT_PLAN.html
 * Owner: Almond
 */

const { sql } = require('./db');

const orders = {

  async create(data) {
    const db = sql();
    const [row] = await db`
      INSERT INTO orders (id, shopify_order_id, order_number, channel, location_code, customer_id, subtotal, tax, total, item_count, status, ordered_at)
      VALUES (${data.id || data.orderNumber}, ${data.shopifyOrderId || null}, ${data.orderNumber || null},
        ${data.channel || 'retail'}, ${data.locationCode || null}, ${data.customerId || null},
        ${data.subtotal || 0}, ${data.tax || 0}, ${data.total || 0}, ${data.itemCount || 0},
        ${data.status || 'completed'}, ${data.orderedAt})
      ON CONFLICT (shopify_order_id) DO UPDATE SET
        total = EXCLUDED.total, item_count = EXCLUDED.item_count, status = EXCLUDED.status
      RETURNING *
    `;
    return row;
  },

  async getById(id) {
    const db = sql();
    const [row] = await db`
      SELECT o.*, c.name AS customer_name, c.email AS customer_email
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ${id}
    `;
    return row || null;
  },

  async getByShopifyId(shopifyOrderId) {
    const db = sql();
    const [row] = await db`SELECT * FROM orders WHERE shopify_order_id = ${shopifyOrderId}`;
    return row || null;
  },

  async getRecent(limit = 50) {
    const db = sql();
    return db`
      SELECT o.*, c.name AS customer_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ORDER BY o.ordered_at DESC
      LIMIT ${limit}
    `;
  },

  async getByCustomer(customerId, limit = 50) {
    const db = sql();
    return db`
      SELECT * FROM orders
      WHERE customer_id = ${customerId}
      ORDER BY ordered_at DESC
      LIMIT ${limit}
    `;
  },

  async getByLocation(locationCode, days = 30) {
    const db = sql();
    return db`
      SELECT * FROM orders
      WHERE location_code = ${locationCode}
        AND ordered_at > NOW() - (${days} || ' days')::interval
      ORDER BY ordered_at DESC
    `;
  },

  async getSummary(days = 30) {
    const db = sql();
    const [r] = await db`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total), 0)::numeric AS total_revenue,
        COALESCE(AVG(total), 0)::numeric AS avg_order_value,
        COALESCE(AVG(item_count), 0)::numeric AS avg_items
      FROM orders
      WHERE ordered_at > NOW() - (${days} || ' days')::interval
    `;
    return r;
  },

  async count() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS count FROM orders`;
    return r.count;
  },
};

module.exports = orders;
