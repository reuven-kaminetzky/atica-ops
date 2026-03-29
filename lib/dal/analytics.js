/**
 * lib/dal/analytics.js — Flexible Data Breakdown
 *
 * Supports the Group By / THEN BY pattern from ATCM + Lightspeed R.
 * Dynamic GROUP BY queries based on user-selected dimensions.
 *
 * Usage:
 *   const data = await analytics.getBreakdown({
 *     groupBy: 'category',
 *     thenBy: ['mp'],
 *     columns: ['stock', 'sales', 'velocity'],
 *     filters: { dateRange: 30, outOfStock: false },
 *     sort: { column: 'sales', direction: 'desc' },
 *   });
 *
 * Owner: Almond (backend/infra)
 * Design: docs/ANALYTICS_DESIGN.md
 */

const { sql } = require('./db');

// ── Dimension definitions ─────────────────────────────────
// Maps user-facing dimension names to SQL expressions
const DIMENSIONS = {
  category: {
    select: 'mp.category',
    label: 'mp.category',
    join: '',
  },
  vendor: {
    select: 'mp.vendor_id',
    label: "COALESCE(v.name, mp.vendor_id, 'No Vendor')",
    join: 'LEFT JOIN vendors v ON v.id = mp.vendor_id',
  },
  mp: {
    select: 'mp.id',
    label: 'mp.name',
    join: '',
  },
  style: {
    select: 'st.id',
    label: 'COALESCE(st.colorway, st.title, st.id)',
    join: 'LEFT JOIN styles st ON st.mp_id = mp.id',
  },
  location: {
    select: 'si.location',
    label: 'si.location',
    join: 'LEFT JOIN store_inventory si ON si.mp_id = mp.id',
  },
  grade: {
    select: 'st.grade',
    label: 'st.grade',
    join: 'LEFT JOIN styles st ON st.mp_id = mp.id',
  },
};

// ── Column definitions ────────────────────────────────────
// Maps user-facing column names to SQL aggregations
const COLUMNS = {
  stock: 'COALESCE(SUM(mp.total_inventory), 0)::int',
  sales: 'COALESCE(sales_agg.total_units, 0)::int',
  revenue: 'COALESCE(sales_agg.total_revenue, 0)::numeric',
  velocity: 'COALESCE(MAX(mp.velocity_per_week), 0)::numeric',
  x_rate: 'COALESCE(MAX(mp.sell_through), 0)::numeric',
  days: 'COALESCE(MIN(NULLIF(mp.days_of_stock, 999)), 0)::int',
  incoming: 'COALESCE(po_agg.incoming_units, 0)::int',
  sku_count: 'COALESCE(SUM(st_count.variant_count), 0)::int',
  style_count: 'COUNT(DISTINCT st_count.id)::int',
};

// Sortable column mapping (safe column references for ORDER BY)
const SORT_COLUMNS = {
  stock: 'stock', sales: 'sales', revenue: 'revenue',
  velocity: 'velocity', x_rate: 'x_rate', incoming: 'incoming',
  style_count: 'style_count', sku_count: 'sku_count', mp_count: 'mp_count',
};

const VALID_DIMENSIONS = Object.keys(DIMENSIONS);
const VALID_COLUMNS = Object.keys(COLUMNS);

// ── Main query builder ────────────────────────────────────

const analytics = {

  /**
   * getBreakdown — the core analytics query
   *
   * Returns rows grouped by the primary dimension, with aggregated metrics.
   * Does NOT return nested children — the client calls again with filters
   * to drill into a specific group (lazy loading, not recursive SQL).
   */
  async getBreakdown(opts = {}) {
    const db = sql();

    const groupBy = VALID_DIMENSIONS.includes(opts.groupBy) ? opts.groupBy : 'category';
    const sortCol = SORT_COLUMNS[opts.sort?.column] || 'stock';
    const sortDir = opts.sort?.direction === 'asc' ? 'ASC' : 'DESC';
    const filters = opts.filters || {};

    const dim = DIMENSIONS[groupBy];

    // Date range for sales (validated as integer — safe for interpolation)
    const days = Math.max(1, Math.min(365, parseInt(filters.dateRange) || 30));
    const limit = Math.max(1, Math.min(500, parseInt(filters.limit) || 200));

    // Build parameterized WHERE clauses
    const whereClauses = [
      'mp.external_ids IS NOT NULL',
      'array_length(mp.external_ids, 1) > 0',
    ];
    const salesWhereClauses = [];
    const params = [];
    let paramIdx = 1;

    if (filters.category) {
      whereClauses.push(`mp.category = $${paramIdx}`);
      params.push(filters.category);
      paramIdx++;
    }
    if (filters.vendor) {
      whereClauses.push(`mp.vendor_id = $${paramIdx}`);
      params.push(filters.vendor);
      paramIdx++;
    }
    if (filters.mp) {
      whereClauses.push(`mp.id = $${paramIdx}`);
      params.push(filters.mp);
      paramIdx++;
    }
    if (filters.outOfStock) {
      whereClauses.push('mp.total_inventory = 0');
    }
    if (filters.signal && ['hot', 'rising', 'steady', 'slow', 'stockout'].includes(filters.signal)) {
      whereClauses.push(`mp.signal = $${paramIdx}`);
      params.push(filters.signal);
      paramIdx++;
    }
    if (filters.location) {
      salesWhereClauses.push(`AND store = $${paramIdx}`);
      params.push(filters.location);
      paramIdx++;
    }

    const whereSQL = whereClauses.join('\n        AND ');
    const salesLocationSQL = salesWhereClauses.join(' ');

    const query = `
      WITH sales_by_mp AS (
        SELECT mp_id,
          SUM(quantity)::int AS total_units,
          SUM(total)::numeric AS total_revenue
        FROM sales
        WHERE ordered_at > NOW() - INTERVAL '${days} days'
        ${salesLocationSQL}
        GROUP BY mp_id
      ),
      po_by_mp AS (
        SELECT mp_id,
          SUM(units)::int AS incoming_units
        FROM purchase_orders
        WHERE stage NOT IN ('received', 'distribution', 'concept')
        GROUP BY mp_id
      ),
      style_by_mp AS (
        SELECT mp_id,
          COUNT(*)::int AS style_count,
          SUM(variant_count)::int AS variant_count
        FROM styles
        WHERE status = 'active'
        GROUP BY mp_id
      )
      SELECT
        ${dim.select} AS group_key,
        ${dim.label} AS group_label,
        COUNT(DISTINCT mp.id)::int AS mp_count,
        COALESCE(SUM(mp.total_inventory), 0)::int AS stock,
        COALESCE(SUM(sales_agg.total_units), 0)::int AS sales,
        COALESCE(SUM(sales_agg.total_revenue), 0)::numeric AS revenue,
        CASE WHEN SUM(mp.velocity_per_week) > 0
          THEN ROUND(SUM(mp.velocity_per_week)::numeric, 2)
          ELSE 0 END AS velocity,
        CASE WHEN SUM(mp.total_inventory) > 0 AND SUM(sales_agg.total_units) > 0
          THEN ROUND((SUM(sales_agg.total_units)::numeric / (SUM(mp.total_inventory) + SUM(sales_agg.total_units)) * 100)::numeric, 1)
          ELSE 0 END AS x_rate,
        COALESCE(SUM(po_agg.incoming_units), 0)::int AS incoming,
        COALESCE(SUM(st_agg.style_count), 0)::int AS style_count,
        COALESCE(SUM(st_agg.variant_count), 0)::int AS sku_count
      FROM master_products mp
      ${dim.join}
      LEFT JOIN sales_by_mp sales_agg ON sales_agg.mp_id = mp.id
      LEFT JOIN po_by_mp po_agg ON po_agg.mp_id = mp.id
      LEFT JOIN style_by_mp st_agg ON st_agg.mp_id = mp.id
      WHERE ${whereSQL}
      GROUP BY ${dim.select}, ${dim.label}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT ${limit}
    `;

    const rows = await db.unsafe(query, params);

    // Compute totals
    const totals = {
      mp_count: rows.reduce((s, r) => s + (r.mp_count || 0), 0),
      stock: rows.reduce((s, r) => s + (r.stock || 0), 0),
      sales: rows.reduce((s, r) => s + (r.sales || 0), 0),
      revenue: rows.reduce((s, r) => s + parseFloat(r.revenue || 0), 0),
      velocity: rows.reduce((s, r) => s + parseFloat(r.velocity || 0), 0),
      incoming: rows.reduce((s, r) => s + (r.incoming || 0), 0),
      sku_count: rows.reduce((s, r) => s + (r.sku_count || 0), 0),
    };

    return {
      groupBy,
      dateRange: days,
      rows: rows.map(r => ({
        key: r.group_key,
        label: r.group_label,
        mpCount: r.mp_count,
        stock: r.stock,
        sales: r.sales,
        revenue: parseFloat(r.revenue || 0),
        velocity: parseFloat(r.velocity || 0),
        xRate: parseFloat(r.x_rate || 0),
        incoming: r.incoming,
        styleCount: r.style_count,
        skuCount: r.sku_count,
      })),
      totals,
    };
  },

  /**
   * getDimensions — returns available dimensions for the UI
   */
  getDimensions() {
    return VALID_DIMENSIONS.map(d => ({
      id: d,
      label: d.charAt(0).toUpperCase() + d.slice(1),
    }));
  },

  /**
   * getColumns — returns available columns for the UI
   */
  getColumns() {
    return VALID_COLUMNS.map(c => ({
      id: c,
      label: c === 'x_rate' ? 'X Rate' : c === 'sku_count' ? 'SKUs' : c.charAt(0).toUpperCase() + c.slice(1),
    }));
  },
};

module.exports = analytics;
