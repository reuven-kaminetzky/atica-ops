'use server';

function getSql() {
  const { neon } = require('@netlify/neon');
  return neon();
}

export async function getDbHealth() {
  try {
    const sql = getSql();
    const [products, vendors, pos, payments, shipments] = await Promise.all([
      sql`SELECT COUNT(*) as n FROM master_products`.catch(() => [{ n: 0 }]),
      sql`SELECT COUNT(*) as n FROM vendors`.catch(() => [{ n: 0 }]),
      sql`SELECT COUNT(*) as n FROM purchase_orders WHERE stage NOT IN ('received', 'distribution')`.catch(() => [{ n: 0 }]),
      sql`SELECT COUNT(*) as n FROM po_payments WHERE status IN ('due', 'overdue')`.catch(() => [{ n: 0 }]),
      sql`SELECT COUNT(*) as n FROM shipments WHERE status != 'delivered'`.catch(() => [{ n: 0 }]),
    ]);
    return {
      products: parseInt(products[0].n),
      vendors: parseInt(vendors[0].n),
      activePOs: parseInt(pos[0].n),
      paymentsDue: parseInt(payments[0].n),
      shipments: parseInt(shipments[0].n),
    };
  } catch (e) {
    return { error: e.message };
  }
}

export async function getProducts() {
  try {
    const sql = getSql();
    return await sql`
      SELECT mp.*, ps.completeness, ps.fabric_type,
        COALESCE(po_agg.active_pos, 0) as active_pos,
        COALESCE(po_agg.committed_cost, 0) as committed_cost
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

export async function getPurchaseOrders() {
  try {
    const sql = getSql();
    return await sql`
      SELECT po.*,
        COALESCE(pmt.total_amount, 0) as total_payments,
        COALESCE(pmt.paid_amount, 0) as paid_amount,
        COALESCE(pmt.overdue_count, 0) as overdue_payments
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
