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
    // Overdue: due_date passed and not paid
    await db`UPDATE po_payments SET status = 'overdue' WHERE due_date < ${now} AND status IN ('planned', 'upcoming', 'due')`;
    // Due: due within 7 days
    await db`UPDATE po_payments SET status = 'due' WHERE due_date BETWEEN ${now} AND ${now}::date + 7 AND status IN ('planned', 'upcoming')`;
    return { refreshed: true };
  },
};

module.exports = payments;
