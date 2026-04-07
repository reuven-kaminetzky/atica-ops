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
    // Try orders table first, fall back to sales table
    try {
      const [r] = await db`
        SELECT COUNT(*)::int AS order_count,
          COALESCE(SUM(total), 0)::numeric AS total_revenue,
          COALESCE(AVG(total), 0)::numeric AS avg_order_value,
          COALESCE(AVG(item_count), 0)::numeric AS avg_items
        FROM orders WHERE ordered_at > NOW() - (${days} || ' days')::interval`;
      if (r.order_count > 0) return r;
    } catch { /* orders table may not exist */ }
    // Fall back: aggregate from sales table
    try {
      const [r] = await db`
        SELECT COUNT(DISTINCT order_id)::int AS order_count,
          COALESCE(SUM(total), 0)::numeric AS total_revenue,
          CASE WHEN COUNT(DISTINCT order_id) > 0
            THEN ROUND(SUM(total)::numeric / COUNT(DISTINCT order_id), 2) ELSE 0 END AS avg_order_value,
          CASE WHEN COUNT(DISTINCT order_id) > 0
            THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT order_id), 1) ELSE 0 END AS avg_items
        FROM sales WHERE ordered_at > NOW() - (${days} || ' days')::interval`;
      return r;
    } catch { return { order_count: 0, total_revenue: 0, avg_order_value: 0, avg_items: 0 }; }
  },

  async count() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS count FROM orders`;
    return r.count;
  },

  async getRevenueByDay(days = 30) {
    const db = sql();
    try {
      const rows = await db`
        SELECT DATE(ordered_at) AS day, COUNT(*)::int AS orders,
          COALESCE(SUM(total), 0)::numeric AS revenue
        FROM orders WHERE ordered_at > NOW() - (${days} || ' days')::interval
        GROUP BY 1 ORDER BY 1 ASC`;
      if (rows.length > 0) return rows;
    } catch { /* orders table may not exist */ }
    try {
      return await db`
        SELECT DATE(ordered_at) AS day, COUNT(DISTINCT order_id)::int AS orders,
          COALESCE(SUM(total), 0)::numeric AS revenue
        FROM sales WHERE ordered_at > NOW() - (${days} || ' days')::interval
        GROUP BY 1 ORDER BY 1 ASC`;
    } catch { return []; }
  },

  async getRevenueByChannel(days = 30) {
    const db = sql();
    // Try orders table first
    try {
      const rows = await db`
        SELECT COALESCE(channel, 'retail') AS channel,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(total), 0)::numeric AS total_revenue,
          COALESCE(AVG(total), 0)::numeric AS avg_order_value
        FROM orders WHERE ordered_at > NOW() - (${days} || ' days')::interval
        GROUP BY 1 ORDER BY total_revenue DESC`;
      if (rows.length > 0) return rows;
    } catch { /* orders table may not exist */ }
    // Fall back to sales table (uses 'store' column for channel info)
    try {
      return await db`
        SELECT COALESCE(
          CASE WHEN store IN ('Online', 'online') THEN 'online' ELSE 'retail' END,
          'retail'
        ) AS channel,
          COUNT(DISTINCT order_id)::int AS order_count,
          COALESCE(SUM(total), 0)::numeric AS total_revenue,
          CASE WHEN COUNT(DISTINCT order_id) > 0
            THEN ROUND(SUM(total)::numeric / COUNT(DISTINCT order_id), 2) ELSE 0 END AS avg_order_value
        FROM sales WHERE ordered_at > NOW() - (${days} || ' days')::interval
        GROUP BY 1 ORDER BY total_revenue DESC`;
    } catch { return []; }
  },
};

module.exports = orders;
