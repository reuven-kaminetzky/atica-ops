/**
 * lib/dal/sales.js — Sales Data Access Layer
 *
 * Table: sales
 * Revenue inflow queries for cash flow projection.
 */

const { sql } = require('./db');

const sales = {
  async getRevenueSummary(days = 30) {
    const db = sql();
    const [r] = await db`
      SELECT
        COUNT(DISTINCT order_id)::int AS order_count,
        COALESCE(SUM(total), 0)::numeric AS total_revenue,
        COALESCE(SUM(quantity), 0)::int AS units_sold,
        COALESCE(AVG(total), 0)::numeric AS avg_order_value
      FROM sales
      WHERE ordered_at >= NOW() - (${days} || ' days')::interval
    `;
    return r;
  },

  async getRevenueByWeek(weeks = 12) {
    const db = sql();
    return db`
      SELECT
        date_trunc('week', ordered_at)::date AS week_start,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COALESCE(SUM(quantity), 0)::int AS units,
        COUNT(DISTINCT order_id)::int AS orders
      FROM sales
      WHERE ordered_at >= NOW() - (${weeks * 7} || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  async getRevenueByMonth(months = 6) {
    const db = sql();
    return db`
      SELECT
        date_trunc('month', ordered_at)::date AS month_start,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COALESCE(SUM(quantity), 0)::int AS units,
        COUNT(DISTINCT order_id)::int AS orders
      FROM sales
      WHERE ordered_at >= NOW() - (${months} || ' months')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  async getRevenueByStore(days = 30) {
    const db = sql();
    return db`
      SELECT
        COALESCE(store, 'Online') AS store,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COALESCE(SUM(quantity), 0)::int AS units,
        COUNT(DISTINCT order_id)::int AS orders
      FROM sales
      WHERE ordered_at >= NOW() - (${days} || ' days')::interval
      GROUP BY 1
      ORDER BY revenue DESC
    `;
  },

  async getRevenueByMP(days = 30) {
    const db = sql();
    return db`
      SELECT
        s.mp_id,
        mp.name AS mp_name,
        mp.category,
        COALESCE(SUM(s.total), 0)::numeric AS revenue,
        COALESCE(SUM(s.quantity), 0)::int AS units,
        COUNT(DISTINCT s.order_id)::int AS orders
      FROM sales s
      LEFT JOIN master_products mp ON mp.id = s.mp_id
      WHERE s.ordered_at >= NOW() - (${days} || ' days')::interval
        AND s.mp_id IS NOT NULL
      GROUP BY s.mp_id, mp.name, mp.category
      ORDER BY revenue DESC
    `;
  },

  async getDailyRevenue(days = 30) {
    const db = sql();
    return db`
      SELECT
        ordered_at::date AS day,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COALESCE(SUM(quantity), 0)::int AS units,
        COUNT(DISTINCT order_id)::int AS orders
      FROM sales
      WHERE ordered_at >= NOW() - (${days} || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },
};

module.exports = sales;
