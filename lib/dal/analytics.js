/**
 * lib/dal/analytics.js — Product Data Breakdown
 *
 * Group by dimension → get aggregated metrics.
 * Simple. Works with whatever data exists. No external_ids filter.
 *
 * Owner: Almond (backend)
 */

const { sql } = require('./db');

const DIMENSIONS = {
  category: {
    select: 'mp.category',
    label: 'mp.category',
    groupBy: 'mp.category',
    join: '',
  },
  vendor: {
    select: 'mp.vendor_id',
    label: "COALESCE(v.name, mp.vendor_id, 'Unknown')",
    groupBy: "mp.vendor_id, COALESCE(v.name, mp.vendor_id, 'Unknown')",
    join: 'LEFT JOIN vendors v ON v.id = mp.vendor_id',
  },
  mp: {
    select: 'mp.id',
    label: 'mp.name',
    groupBy: 'mp.id, mp.name',
    join: '',
  },
  style: {
    select: 'st.id',
    label: "COALESCE(st.colorway, st.title, st.id)",
    groupBy: "st.id, COALESCE(st.colorway, st.title, st.id)",
    join: 'JOIN styles st ON st.mp_id = mp.id',
  },
  grade: {
    select: 'st.grade',
    label: "COALESCE(st.grade, 'Ungraded')",
    groupBy: "st.grade, COALESCE(st.grade, 'Ungraded')",
    join: 'JOIN styles st ON st.mp_id = mp.id',
  },
  fit: {
    select: 'sk.fit',
    label: "COALESCE(sk.fit, 'One Fit')",
    groupBy: "sk.fit",
    join: 'JOIN styles st ON st.mp_id = mp.id JOIN skus sk ON sk.style_id = st.id',
  },
  size: {
    select: 'sk.size',
    label: 'sk.size',
    groupBy: 'sk.size',
    join: 'JOIN styles st ON st.mp_id = mp.id JOIN skus sk ON sk.style_id = st.id',
  },
  length: {
    select: 'sk.length',
    label: "COALESCE(sk.length, 'Standard')",
    groupBy: 'sk.length',
    join: 'JOIN styles st ON st.mp_id = mp.id JOIN skus sk ON sk.style_id = st.id',
  },
  location: {
    select: 'ie.location_code',
    label: 'ie.location_code',
    groupBy: 'ie.location_code',
    join: 'JOIN styles st ON st.mp_id = mp.id JOIN skus sk ON sk.style_id = st.id JOIN inventory_events ie ON ie.sku_id = sk.id',
  },
};

const analytics = {

  getDimensions() {
    return Object.entries(DIMENSIONS).map(([id]) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
    }));
  },

  async getBreakdown(opts = {}) {
    const db = sql();
    const groupBy = DIMENSIONS[opts.groupBy] ? opts.groupBy : 'category';
    const dim = DIMENSIONS[groupBy];
    const days = Math.max(1, Math.min(365, parseInt(opts.filters?.dateRange) || 30));

    const conditions = ['1=1'];
    const params = [];
    let pi = 1;

    if (opts.filters?.category) {
      conditions.push(`mp.category = $${pi++}`);
      params.push(opts.filters.category);
    }
    if (opts.filters?.vendor) {
      conditions.push(`mp.vendor_id = $${pi++}`);
      params.push(opts.filters.vendor);
    }
    if (opts.filters?.mp) {
      conditions.push(`mp.id = $${pi++}`);
      params.push(opts.filters.mp);
    }

    const where = conditions.join(' AND ');

    // Check which tables exist so we don't reference missing ones
    let hasSales = false, hasPOs = false;
    try { await db`SELECT 1 FROM sales LIMIT 1`; hasSales = true; } catch {}
    try { await db`SELECT 1 FROM purchase_orders LIMIT 1`; hasPOs = true; } catch {}

    // For dimensions needing JOINs to tables that may not exist, fall back
    const needsStyles = ['style', 'grade'].includes(groupBy);
    const needsSkus = ['fit', 'size', 'length'].includes(groupBy);
    const needsInvEvents = groupBy === 'location';

    if (needsSkus || needsInvEvents) {
      let tablesOk = true;
      try { await db`SELECT 1 FROM styles LIMIT 1`; } catch { tablesOk = false; }
      if (needsSkus) try { await db`SELECT 1 FROM skus LIMIT 1`; } catch { tablesOk = false; }
      if (needsInvEvents) try { await db`SELECT 1 FROM inventory_events LIMIT 1`; } catch { tablesOk = false; }
      if (!tablesOk) {
        // Fall back to category view
        return this.getBreakdown({ ...opts, groupBy: 'category', thenBy: [] });
      }
    }

    // Build CTEs only for tables that exist
    const ctes = [];
    if (hasSales) {
      ctes.push(`sales_agg AS (
        SELECT mp_id, SUM(quantity)::int AS units, SUM(total)::numeric AS revenue
        FROM sales WHERE ordered_at > NOW() - INTERVAL '${days} days'
        GROUP BY mp_id
      )`);
    }
    if (hasPOs) {
      ctes.push(`po_agg AS (
        SELECT mp_id, SUM(units)::int AS incoming
        FROM purchase_orders WHERE stage NOT IN ('received','distribution','concept')
        GROUP BY mp_id
      )`);
    }

    const withClause = ctes.length > 0 ? `WITH ${ctes.join(',\n')}` : '';
    const salesJoin = hasSales ? 'LEFT JOIN sales_agg sa ON sa.mp_id = mp.id' : '';
    const poJoin = hasPOs ? 'LEFT JOIN po_agg pa ON pa.mp_id = mp.id' : '';
    const salesCol = hasSales ? 'COALESCE(SUM(sa.units), 0)::int' : '0::int';
    const revCol = hasSales ? 'COALESCE(SUM(sa.revenue), 0)::numeric' : '0::numeric';
    const incCol = hasPOs ? 'COALESCE(SUM(pa.incoming), 0)::int' : '0::int';

    const query = `
      ${withClause}
      SELECT
        ${dim.select} AS key,
        ${dim.label} AS label,
        COUNT(DISTINCT mp.id)::int AS mp_count,
        COALESCE(SUM(mp.total_inventory), 0)::int AS stock,
        ${salesCol} AS sales,
        ${revCol} AS revenue,
        CASE WHEN SUM(mp.velocity_per_week) > 0
          THEN ROUND(SUM(mp.velocity_per_week)::numeric, 1) ELSE 0 END AS velocity,
        ${incCol} AS incoming,
        COALESCE(MIN(NULLIF(mp.days_of_stock, 999)), 0)::int AS days
      FROM master_products mp
      ${dim.join}
      ${salesJoin}
      ${poJoin}
      WHERE ${where}
      GROUP BY ${dim.groupBy}
      ORDER BY stock DESC NULLS LAST
      LIMIT 200
    `;

    let rows = [];
    try {
      const result = await db(query, params);
      rows = Array.isArray(result) ? result : [];
    } catch (e) {
      return { groupBy, rows: [], totals: {}, error: `Query failed: ${e.message}` };
    }

    const totals = {};
    for (const col of ['mp_count', 'stock', 'sales', 'revenue', 'velocity', 'incoming']) {
      totals[col] = rows.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0);
    }

    let enrichedRows = rows.map(r => ({
      key: r.key,
      label: r.label || r.key || '—',
      mpId: groupBy === 'mp' ? r.key : undefined,
      mp_count: r.mp_count,
      stock: r.stock,
      sales: r.sales,
      revenue: parseFloat(r.revenue || 0),
      velocity: parseFloat(r.velocity || 0),
      x_rate: 0,
      days: parseInt(r.days || 0),
      incoming: r.incoming,
    }));

    // thenBy: load children
    const thenBy = opts.thenBy || [];
    if (thenBy.length > 0 && DIMENSIONS[thenBy[0]]) {
      for (const row of enrichedRows) {
        try {
          const childResult = await this.getBreakdown({
            groupBy: thenBy[0],
            filters: { ...opts.filters, [groupBy]: row.key },
          });
          row.children = childResult.rows || [];
        } catch {
          row.children = [];
        }
      }
    }

    return {
      groupBy,
      dateRange: days,
      columns: opts.columns || ['stock', 'sales', 'velocity', 'days', 'incoming'],
      rows: enrichedRows,
      totals,
    };
  },
};

module.exports = analytics;
