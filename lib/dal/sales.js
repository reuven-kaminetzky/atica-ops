/**
 * lib/dal/sales.js — Sales Data Access Layer
 *
 * Reads from the sales table (populated by Shopify sync).
 * One row per line item, not per order.
 */

const { sql } = require('./db');

const sales = {
  /** Weekly revenue for the last N weeks, grouped by week. */
  async getWeeklyRevenue(weeks = 12) {
    const db = sql();
    return db`
      SELECT
        date_trunc('week', ordered_at)::date AS week_start,
        COALESCE(SUM(total), 0)::numeric(12,2) AS revenue,
        COALESCE(SUM(quantity), 0)::int AS units,
        COUNT(DISTINCT order_id)::int AS orders
      FROM sales
      WHERE ordered_at >= NOW() - (${weeks} * INTERVAL '1 week')
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  /** Daily revenue for the last N days. */
  async getDailyRevenue(days = 30) {
    const db = sql();
    return db`
      SELECT
        ordered_at::date AS day,
        COALESCE(SUM(total), 0)::numeric(12,2) AS revenue,
        COALESCE(SUM(quantity), 0)::int AS units,
        COUNT(DISTINCT order_id)::int AS orders
      FROM sales
      WHERE ordered_at >= NOW() - (${days} * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  /** Revenue by store for a given period. */
  async getByStore(days = 30) {
    const db = sql();
    return db`
      SELECT
        COALESCE(store, 'Unknown') AS store,
        COALESCE(SUM(total), 0)::numeric(12,2) AS revenue,
        COALESCE(SUM(quantity), 0)::int AS units,
        COUNT(DISTINCT order_id)::int AS orders
      FROM sales
      WHERE ordered_at >= NOW() - (${days} * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY revenue DESC
    `;
  },

  /** Top selling MPs by revenue. */
  async getTopMPs(days = 30, limit = 10) {
    const db = sql();
    return db`
      SELECT
        s.mp_id,
        mp.name AS mp_name,
        mp.category,
        COALESCE(SUM(s.total), 0)::numeric(12,2) AS revenue,
        COALESCE(SUM(s.quantity), 0)::int AS units,
        COUNT(DISTINCT s.order_id)::int AS orders
      FROM sales s
      LEFT JOIN master_products mp ON mp.id = s.mp_id
      WHERE s.ordered_at >= NOW() - (${days} * INTERVAL '1 day')
        AND s.mp_id IS NOT NULL
      GROUP BY s.mp_id, mp.name, mp.category
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;
  },

  /** Total revenue summary. */
  async getSummary(days = 30) {
    const db = sql();
    const [row] = await db`
      SELECT
        COALESCE(SUM(total), 0)::numeric(12,2) AS total_revenue,
        COALESCE(SUM(quantity), 0)::int AS total_units,
        COUNT(DISTINCT order_id)::int AS total_orders,
        MIN(ordered_at) AS earliest,
        MAX(ordered_at) AS latest
      FROM sales
      WHERE ordered_at >= NOW() - (${days} * INTERVAL '1 day')
    `;
    return row;
  },
};

module.exports = sales;
