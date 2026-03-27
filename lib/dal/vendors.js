/**
 * lib/dal/vendors.js — Vendor Data Access Layer
 */

const { sql } = require('./db');

const vendors = {
  async getAll() {
    const db = sql();
    return db`
      SELECT v.*,
        COALESCE(po_agg.total_pos, 0)::int AS po_count,
        COALESCE(po_agg.active_pos, 0)::int AS active_pos,
        COALESCE(po_agg.total_units, 0)::int AS total_units,
        COALESCE(po_agg.total_fob, 0)::numeric AS total_committed,
        COALESCE(mp_agg.product_count, 0)::int AS product_count
      FROM vendors v
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_pos,
          COUNT(*) FILTER (WHERE stage NOT IN ('received','distribution')) AS active_pos,
          SUM(units) AS total_units, SUM(fob_total) AS total_fob
        FROM purchase_orders WHERE vendor_id = v.id
      ) po_agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS product_count FROM master_products WHERE vendor_id = v.id
      ) mp_agg ON TRUE
      ORDER BY v.name
    `;
  },

  async count() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS n FROM vendors`;
    return r.n;
  },
};

module.exports = vendors;
