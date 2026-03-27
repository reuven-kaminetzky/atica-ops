/**
 * lib/dal/purchase-orders.js — Purchase Order Data Access Layer
 * 
 * All PO database operations: CRUD, stage advancement, queries.
 * Business logic (gate checks, side effects) lives in lib/effects.js.
 */

const { sql } = require('./db');

const STAGES = [
  { id: 1,  name: 'concept' },
  { id: 2,  name: 'design' },
  { id: 3,  name: 'sample' },
  { id: 4,  name: 'approved', gate: 'pd' },
  { id: 5,  name: 'costed', gate: 'finance' },
  { id: 6,  name: 'ordered' },
  { id: 7,  name: 'production' },
  { id: 8,  name: 'qc', gate: 'pd' },
  { id: 9,  name: 'shipped' },
  { id: 10, name: 'in_transit' },
  { id: 11, name: 'received' },
  { id: 12, name: 'distribution' },
];

const purchaseOrders = {
  STAGES,

  async getAll() {
    const db = sql();
    return db`
      SELECT po.*,
        COALESCE(pmt.total_amount, 0)::numeric AS total_payments,
        COALESCE(pmt.paid_amount, 0)::numeric AS paid_amount,
        COALESCE(pmt.overdue_count, 0)::int AS overdue_payments
      FROM purchase_orders po
      LEFT JOIN LATERAL (
        SELECT SUM(amount) AS total_amount,
          SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END) AS paid_amount,
          COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count
        FROM po_payments WHERE po_id = po.id
      ) pmt ON TRUE
      ORDER BY po.created_at DESC
    `;
  },

  async getById(id) {
    const db = sql();
    const [po] = await db`SELECT * FROM purchase_orders WHERE id = ${id}`;
    if (!po) return null;

    const [payments, history, shipments] = await Promise.all([
      db`SELECT * FROM po_payments WHERE po_id = ${id} ORDER BY due_date ASC`,
      db`SELECT * FROM po_stage_history WHERE po_id = ${id} ORDER BY changed_at DESC`,
      db`SELECT * FROM shipments WHERE po_id = ${id} ORDER BY created_at DESC`,
    ]);

    return { ...po, payments, stageHistory: history, shipments };
  },

  async getActive() {
    const db = sql();
    return db`SELECT * FROM purchase_orders WHERE stage NOT IN ('received', 'distribution') ORDER BY created_at DESC`;
  },

  async getByMP(mpId) {
    const db = sql();
    return db`SELECT * FROM purchase_orders WHERE mp_id = ${mpId} ORDER BY created_at DESC`;
  },

  async getByVendor(vendorId) {
    const db = sql();
    return db`SELECT * FROM purchase_orders WHERE vendor_id = ${vendorId} ORDER BY created_at DESC`;
  },

  async create(data) {
    const db = sql();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const id = data.id || `PO-${month}${day}-${rand}`;

    const fobTotal = (data.fob || 0) * (data.units || 0);
    const landedCost = data.fob ? +(data.fob * (1 + (data.duty || 0) / 100)).toFixed(2) : null;

    const [po] = await db`
      INSERT INTO purchase_orders (
        id, mp_id, mp_name, mp_code, category, vendor_id, vendor_name,
        fob, units, fob_total, landed_cost, moq, lead_days, duty, hts,
        stage, stage_index, etd, eta, container, vessel,
        styles, sizes, fits, payment_terms, notes, tags
      ) VALUES (
        ${id}, ${data.mpId || null}, ${data.mpName || null}, ${data.mpCode || null},
        ${data.category || null}, ${data.vendorId || null}, ${data.vendorName || data.vendor || null},
        ${data.fob || 0}, ${data.units || 0}, ${fobTotal}, ${landedCost},
        ${data.moq || 0}, ${data.lead || data.leadDays || 0}, ${data.duty || 0}, ${data.hts || null},
        ${'concept'}, ${1},
        ${data.etd || null}, ${data.eta || null}, ${data.container || null}, ${data.vessel || null},
        ${JSON.stringify(data.styles || [])}, ${data.sizes || null},
        ${JSON.stringify(data.fits || [])},
        ${data.paymentTerms || 'standard'}, ${data.notes || ''}, ${data.tags || []}
      ) RETURNING *
    `;

    // Auto-generate payment schedule
    if (fobTotal > 0) {
      const terms = data.paymentTerms || 'standard';
      let splits;
      if (terms === 'full') {
        splits = [{ type: 'full', pct: 100, label: 'Full payment' }];
      } else if (terms === 'net30') {
        splits = [{ type: 'deposit', pct: 50, label: 'Deposit (50%)' }, { type: 'balance', pct: 50, label: 'Balance (50%)' }];
      } else {
        splits = [
          { type: 'deposit', pct: 30, label: 'Deposit (30%)' },
          { type: 'production', pct: 40, label: 'Production (40%)' },
          { type: 'balance', pct: 30, label: 'Balance (30%)' },
        ];
      }

      for (const s of splits) {
        await db`
          INSERT INTO po_payments (id, po_id, type, label, pct, amount, status)
          VALUES (${id + '-' + s.type}, ${id}, ${s.type}, ${s.label}, ${s.pct}, ${+(fobTotal * s.pct / 100).toFixed(2)}, 'planned')
          ON CONFLICT (id) DO NOTHING
        `;
      }
    }

    // Audit
    await db`
      INSERT INTO audit_log (entity_type, entity_id, action, changes, performed_by)
      VALUES ('po', ${id}, 'created', ${JSON.stringify(data)}, ${data.createdBy || null})
    `;

    return po;
  },

  async advanceStage(id, { checkedBy = null } = {}) {
    const db = sql();
    const [po] = await db`SELECT * FROM purchase_orders WHERE id = ${id}`;
    if (!po) return { error: 'PO not found' };

    const currentIdx = STAGES.findIndex(s => s.name === po.stage);
    const nextStage = STAGES[currentIdx + 1];
    if (!nextStage) return { error: 'Already at final stage' };

    // Gate check
    if (nextStage.gate && !checkedBy) {
      const label = nextStage.gate === 'pd' ? 'PD' : 'Finance';
      return { error: `${label} check-in required. Pass checkedBy.`, gate: nextStage.gate };
    }

    // Advance
    const [updated] = await db`
      UPDATE purchase_orders SET stage = ${nextStage.name}, stage_index = ${nextStage.id}
      WHERE id = ${id} RETURNING *
    `;

    // Side effects
    const effects = [];

    if (nextStage.name === 'in_transit' && po.container) {
      const shipId = `SH-${id.replace('PO-', '')}`;
      try {
        await db`
          INSERT INTO shipments (id, po_id, container, vessel, origin, etd, eta, status)
          VALUES (${shipId}, ${id}, ${po.container}, ${po.vessel}, ${po.country || 'China'}, ${po.etd}, ${po.eta}, 'in_transit')
          ON CONFLICT (id) DO NOTHING
        `;
        effects.push({ type: 'shipment:created', id: shipId });
      } catch (e) {
        effects.push({ type: 'shipment:failed', error: e.message });
      }
    }

    if (nextStage.name === 'ordered') {
      await db`UPDATE po_payments SET status = 'upcoming' WHERE po_id = ${id} AND type = 'deposit' AND status = 'planned'`;
      effects.push({ type: 'payment:deposit_upcoming' });
    }

    // Audit
    await db`
      INSERT INTO audit_log (entity_type, entity_id, action, changes, performed_by)
      VALUES ('po', ${id}, 'stage_advanced', ${JSON.stringify({ from: po.stage, to: nextStage.name })}, ${checkedBy})
    `;

    return { advanced: true, from: po.stage, to: nextStage.name, purchaseOrder: updated, effects };
  },

  async update(id, fields) {
    const db = sql();
    const [existing] = await db`SELECT * FROM purchase_orders WHERE id = ${id}`;
    if (!existing) return null;

    const fob = fields.fob ?? existing.fob ?? 0;
    const units = fields.units ?? existing.units ?? 0;
    const duty = fields.duty ?? existing.duty ?? 0;

    const [updated] = await db`
      UPDATE purchase_orders SET
        vendor_name = COALESCE(${fields.vendor_name || null}, vendor_name),
        fob = COALESCE(${fields.fob || null}, fob),
        units = COALESCE(${fields.units || null}, units),
        fob_total = ${+(fob * units).toFixed(2)},
        landed_cost = ${+(fob * (1 + duty / 100)).toFixed(2)},
        moq = COALESCE(${fields.moq || null}, moq),
        lead_days = COALESCE(${fields.lead_days || null}, lead_days),
        duty = COALESCE(${fields.duty || null}, duty),
        etd = COALESCE(${fields.etd || null}, etd),
        eta = COALESCE(${fields.eta || null}, eta),
        container = COALESCE(${fields.container || null}, container),
        vessel = COALESCE(${fields.vessel || null}, vessel),
        notes = COALESCE(${fields.notes || null}, notes)
      WHERE id = ${id} RETURNING *
    `;
    return updated;
  },

  async delete(id) {
    const db = sql();
    await db`DELETE FROM purchase_orders WHERE id = ${id}`;
    return { deleted: true };
  },

  async countByStage() {
    const db = sql();
    const rows = await db`SELECT stage, COUNT(*)::int AS count FROM purchase_orders GROUP BY stage`;
    const result = {};
    for (const r of rows) result[r.stage] = r.count;
    return result;
  },

  async count() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS n FROM purchase_orders`;
    return r.n;
  },

  async countActive() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS n FROM purchase_orders WHERE stage NOT IN ('received','distribution')`;
    return r.n;
  },
};

module.exports = purchaseOrders;
