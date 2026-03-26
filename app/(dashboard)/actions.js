'use server';

import { neon } from '@netlify/neon';

export async function getDbHealth() {
  try {
    const sql = neon();
    const [products, vendors, pos, payments] = await Promise.all([
      sql`SELECT COUNT(*)::int as n FROM master_products`.catch(() => [{ n: 0 }]),
      sql`SELECT COUNT(*)::int as n FROM vendors`.catch(() => [{ n: 0 }]),
      sql`SELECT COUNT(*)::int as n FROM purchase_orders WHERE stage NOT IN ('received', 'distribution')`.catch(() => [{ n: 0 }]),
      sql`SELECT COUNT(*)::int as n FROM po_payments WHERE status IN ('due', 'overdue')`.catch(() => [{ n: 0 }]),
    ]);
    return { products: products[0].n, vendors: vendors[0].n, activePOs: pos[0].n, paymentsDue: payments[0].n };
  } catch (e) {
    return { error: e.message };
  }
}

export async function getProducts() {
  try {
    const sql = neon();
    return await sql`
      SELECT mp.*, ps.completeness, ps.fabric_type,
        COALESCE(po_agg.active_pos, 0)::int as active_pos,
        COALESCE(po_agg.committed_cost, 0)::numeric as committed_cost
      FROM master_products mp
      LEFT JOIN product_stack ps ON ps.mp_id = mp.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as active_pos, SUM(fob_total) as committed_cost
        FROM purchase_orders WHERE mp_id = mp.id AND stage NOT IN ('received', 'distribution')
      ) po_agg ON TRUE
      ORDER BY mp.category, mp.name
    `;
  } catch (e) {
    console.error('[actions] getProducts:', e.message);
    return [];
  }
}

export async function getProduct(id) {
  try {
    const sql = neon();
    const [mp] = await sql`SELECT * FROM master_products WHERE id = ${id}`;
    if (!mp) return null;
    const [stack, pos, history] = await Promise.all([
      sql`SELECT * FROM product_stack WHERE mp_id = ${id}`,
      sql`SELECT * FROM purchase_orders WHERE mp_id = ${id} ORDER BY created_at DESC`,
      sql`SELECT * FROM plm_history WHERE mp_id = ${id} ORDER BY changed_at DESC LIMIT 20`,
    ]);
    return { ...mp, stack: stack[0] || null, purchaseOrders: pos, plmHistory: history };
  } catch (e) {
    return null;
  }
}

export async function getPurchaseOrders() {
  try {
    const sql = neon();
    return await sql`
      SELECT po.*,
        COALESCE(pmt.total_amount, 0)::numeric as total_payments,
        COALESCE(pmt.paid_amount, 0)::numeric as paid_amount,
        COALESCE(pmt.overdue_count, 0)::int as overdue_payments
      FROM purchase_orders po
      LEFT JOIN LATERAL (
        SELECT SUM(amount) as total_amount,
          SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END) as paid_amount,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
        FROM po_payments WHERE po_id = po.id
      ) pmt ON TRUE
      ORDER BY po.created_at DESC
    `;
  } catch (e) {
    console.error('[actions] getPurchaseOrders:', e.message);
    return [];
  }
}
