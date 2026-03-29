/**
 * lib/dal/payments.js — Payment Data Access Layer
 */

const { sql } = require('./db');

const payments = {
  async getForPO(poId) {
    const db = sql();
    return db`SELECT * FROM po_payments WHERE po_id = ${poId} ORDER BY due_date ASC`;
  },

  async getAllWithPO() {
    const db = sql();
    return db`
      SELECT p.*, po.mp_name, po.vendor_name 
      FROM po_payments p 
      JOIN purchase_orders po ON po.id = p.po_id 
      ORDER BY p.due_date ASC
    `;
  },

  async getOverdue() {
    const db = sql();
    return db`
      SELECT p.*, po.mp_name, po.vendor_name
      FROM po_payments p
      JOIN purchase_orders po ON po.id = p.po_id
      WHERE p.status = 'overdue'
      ORDER BY p.due_date ASC
    `;
  },

  async countDue() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS n FROM po_payments WHERE status IN ('due', 'overdue')`;
    return r.n;
  },

  async markPaid(paymentId, { paidAmount, paidDate, reference }) {
    const db = sql();
    const [updated] = await db`
      UPDATE po_payments SET status = 'paid', paid_amount = ${paidAmount}, 
        paid_date = ${paidDate || new Date().toISOString()}, paid_reference = ${reference || null}
      WHERE id = ${paymentId} RETURNING *
    `;
    return updated;
  },

  async refreshStatuses() {
    const db = sql();
    const now = new Date().toISOString().split('T')[0];
    await db`UPDATE po_payments SET status = 'overdue' WHERE due_date < ${now} AND status IN ('planned', 'upcoming', 'due')`;
    await db`UPDATE po_payments SET status = 'due' WHERE due_date BETWEEN ${now} AND ${now}::date + 7 AND status IN ('planned', 'upcoming')`;
    return { refreshed: true };
  },

  // ── Stage-based payment shifts (called by event handlers) ──
  async advanceOnStage(poId, stage) {
    const db = sql();
    if (stage === 'ordered') {
      await db`UPDATE po_payments SET status = 'upcoming', due_date = COALESCE(due_date, NOW() + INTERVAL '7 days') WHERE po_id = ${poId} AND type = 'deposit' AND status = 'planned'`;
    } else if (stage === 'shipped') {
      await db`UPDATE po_payments SET status = 'upcoming', due_date = COALESCE(due_date, NOW() + INTERVAL '7 days') WHERE po_id = ${poId} AND type = 'production' AND status = 'planned'`;
    } else if (stage === 'received') {
      await db`UPDATE po_payments SET status = 'due', due_date = COALESCE(due_date, NOW() + INTERVAL '14 days') WHERE po_id = ${poId} AND type = 'balance' AND status IN ('planned', 'upcoming')`;
    }
  },
};

module.exports = payments;
