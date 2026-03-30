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
        COALESCE(po_agg.avg_lead, 0)::int AS avg_lead_days,
        po_agg.last_po_date,
        COALESCE(mp_agg.product_count, 0)::int AS product_count,
        mp_agg.product_names
      FROM vendors v
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_pos,
          COUNT(*) FILTER (WHERE stage NOT IN ('received','distribution')) AS active_pos,
          SUM(units) AS total_units, SUM(fob_total) AS total_fob,
          AVG(lead_days) AS avg_lead,
          MAX(created_at) AS last_po_date
        FROM purchase_orders WHERE vendor_id = v.id
      ) po_agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS product_count,
          ARRAY_AGG(name ORDER BY name) AS product_names
        FROM master_products WHERE vendor_id = v.id
      ) mp_agg ON TRUE
      ORDER BY po_agg.total_fob DESC NULLS LAST, v.name
    `;
  },

  async getById(id) {
    const db = sql();
    const [vendor] = await db`SELECT * FROM vendors WHERE id = ${id}`;
    if (!vendor) return null;

    const pos = await db`SELECT * FROM purchase_orders WHERE vendor_id = ${id} ORDER BY created_at DESC`;
    return { ...vendor, purchaseOrders: pos };
  },

  async count() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS n FROM vendors`;
    return r.n;
  },

  /**
   * computeScore(vendorId) — Vendor scoring from PO history.
   * See docs/INTELLIGENCE_LAYER.md for algorithm.
   * Returns { score, tier, metrics }
   */
  async computeScore(vendorId) {
    const db = sql();

    const pos = await db`
      SELECT id, eta, lead_days, units, stage, created_at,
        (SELECT changed_at FROM po_stage_history WHERE po_id = purchase_orders.id AND to_stage = 'received' LIMIT 1) AS received_at,
        (SELECT changed_at FROM po_stage_history WHERE po_id = purchase_orders.id AND to_stage = 'qc' LIMIT 1) AS qc_at
      FROM purchase_orders
      WHERE vendor_id = ${vendorId} AND stage IN ('received', 'distribution')
      ORDER BY created_at DESC
      LIMIT 20
    `;

    if (pos.length === 0) return { score: null, tier: 'unscored', metrics: {}, poCount: 0 };

    // On-time delivery (30%)
    let onTimeCount = 0;
    for (const po of pos) {
      if (po.eta && po.received_at) {
        if (new Date(po.received_at) <= new Date(new Date(po.eta).getTime() + 7 * 86400000)) {
          onTimeCount++;
        }
      }
    }
    const onTimeRate = pos.length > 0 ? onTimeCount / pos.length : 0;

    // Lead time accuracy (20%)
    let leadDiffs = [];
    for (const po of pos) {
      if (po.lead_days && po.created_at && po.received_at) {
        const actualDays = Math.round((new Date(po.received_at) - new Date(po.created_at)) / 86400000);
        leadDiffs.push(Math.abs(actualDays - po.lead_days));
      }
    }
    const avgLeadDiff = leadDiffs.length > 0 ? leadDiffs.reduce((a, b) => a + b, 0) / leadDiffs.length : 0;
    const leadAccuracy = Math.max(0, 1 - avgLeadDiff / 30); // 30 days off = 0

    // QC pass rate (25%) — POs that made it past QC
    const qcCount = pos.filter(po => po.qc_at).length;
    const qcRate = pos.length > 0 ? qcCount / pos.length : 0;

    // Communication rating (10%) — manual, from vendor record
    const [vendor] = await db`SELECT communication_rating FROM vendors WHERE id = ${vendorId}`;
    const commRating = (vendor?.communication_rating || 3) / 5;

    const score = Math.round(
      (onTimeRate * 30 + leadAccuracy * 20 + qcRate * 25 + 15 + commRating * 10)
    );

    const tier = score >= 90 ? 'gold' : score >= 70 ? 'silver' : score >= 50 ? 'bronze' : 'watch';

    // Cache the score
    await db`
      UPDATE vendors SET score_cache = ${JSON.stringify({ score, tier, onTimeRate, leadAccuracy, qcRate })}::jsonb,
        last_scored_at = NOW()
      WHERE id = ${vendorId}
    `.catch(() => {}); // columns may not exist yet

    return {
      score, tier,
      metrics: { onTimeRate: Math.round(onTimeRate * 100), leadAccuracy: Math.round(leadAccuracy * 100), qcRate: Math.round(qcRate * 100), communication: vendor?.communication_rating || 3 },
      poCount: pos.length,
    };
  },

  /**
   * computeStyleGrades() — Batch grade computation for all active styles.
   * See docs/INTELLIGENCE_LAYER.md for thresholds.
   */
  async computeStyleGrades() {
    const db = sql();

    // Get configurable thresholds
    const [setting] = await db`SELECT value FROM app_settings WHERE key = 'grade_thresholds'`.catch(() => [null]);
    const thresholds = (setting?.value && typeof setting.value === 'object')
      ? setting.value
      : { A: { min_velocity: 2, min_sell_through: 60 }, B: { min_velocity: 1, min_sell_through: 40 }, C: { min_velocity: 0.3, min_sell_through: 20 } };

    const styles = await db`
      SELECT st.id, st.inventory,
        COALESCE(sa.units_sold, 0)::int AS units_sold,
        COALESCE(sa.units_sold::numeric / NULLIF(13, 0), 0) AS velocity
      FROM styles st
      LEFT JOIN LATERAL (
        SELECT SUM(quantity) AS units_sold
        FROM sales WHERE style_id = st.id AND ordered_at >= NOW() - INTERVAL '90 days'
      ) sa ON TRUE
      WHERE st.status = 'active'
    `;

    let updated = 0;
    for (const st of styles) {
      const sellThrough = (st.units_sold + st.inventory) > 0
        ? (st.units_sold / (st.units_sold + st.inventory)) * 100
        : 0;
      const vel = parseFloat(st.velocity) || 0;

      let grade = 'D';
      if (vel >= thresholds.A.min_velocity && sellThrough >= thresholds.A.min_sell_through) grade = 'A';
      else if (vel >= thresholds.B.min_velocity && sellThrough >= thresholds.B.min_sell_through) grade = 'B';
      else if (vel >= thresholds.C.min_velocity && sellThrough >= thresholds.C.min_sell_through) grade = 'C';

      await db`UPDATE styles SET grade = ${grade} WHERE id = ${st.id} AND grade IS DISTINCT FROM ${grade}`;
      updated++;
    }

    return { computed: styles.length, updated };
  },
};

module.exports = vendors;
