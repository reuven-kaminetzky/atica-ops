'use server';

export async function getDbHealth() {
  try {
    const neonModule = require('@netlify/neon');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return { error: 'DATABASE_URL not set' };

    const sql = neonModule.neon(url);

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
    const neonModule = require('@netlify/neon');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return [];

    const sql = neonModule.neon(url);
    const rows = await sql`
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
    return rows;
  } catch (e) {
    console.error('[actions] getProducts failed:', e.message);
    return [];
  }
}

export async function getProduct(id) {
  try {
    const neonModule = require('@netlify/neon');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return null;

    const sql = neonModule.neon(url);
    const [mp] = await sql`SELECT * FROM master_products WHERE id = ${id}`;
    if (!mp) return null;

    const [stack, pos, history] = await Promise.all([
      sql`SELECT * FROM product_stack WHERE mp_id = ${id}`,
      sql`SELECT * FROM purchase_orders WHERE mp_id = ${id} ORDER BY created_at DESC`,
      sql`SELECT * FROM plm_history WHERE mp_id = ${id} ORDER BY changed_at DESC LIMIT 20`,
    ]);

    return {
      ...mp,
      stack: stack[0] || null,
      purchaseOrders: pos,
      plmHistory: history,
    };
  } catch (e) {
    console.error('[actions] getProduct failed:', e.message);
    return null;
  }
}

export async function getPurchaseOrders() {
  try {
    const neonModule = require('@netlify/neon');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return [];

    const sql = neonModule.neon(url);
    const rows = await sql`
      SELECT po.*,
        COALESCE(pmt.total_amount, 0) as total_payments,
        COALESCE(pmt.paid_amount, 0) as paid_amount,
        COALESCE(pmt.overdue_count, 0) as overdue_payments
      FROM purchase_orders po
      LEFT JOIN LATERAL (
        SELECT 
          SUM(amount) as total_amount,
          SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END) as paid_amount,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
        FROM po_payments WHERE po_id = po.id
      ) pmt ON TRUE
      ORDER BY 
        CASE stage 
          WHEN 'concept' THEN 1 WHEN 'design' THEN 2 WHEN 'sample' THEN 3
          WHEN 'approved' THEN 4 WHEN 'costed' THEN 5 WHEN 'ordered' THEN 6
          WHEN 'production' THEN 7 WHEN 'qc' THEN 8 WHEN 'shipped' THEN 9
          WHEN 'in_transit' THEN 10 WHEN 'received' THEN 11 WHEN 'distribution' THEN 12
        END,
        po.created_at DESC
    `;
    return rows;
  } catch (e) {
    console.error('[actions] getPurchaseOrders failed:', e.message);
    return [];
  }
}

export async function runMigration() {
  try {
    const neonModule = require('@netlify/neon');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return { error: 'DATABASE_URL not set' };

    const sql = neonModule.neon(url);
    const fs = require('fs');
    const path = require('path');

    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = migration.split(';').map(s => s.trim()).filter(s => s.length > 0);

    let executed = 0;
    let errors = [];
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
        executed++;
      } catch (e) {
        // Ignore "already exists" errors
        if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
          errors.push(e.message.slice(0, 100));
        }
      }
    }

    return { executed, errors: errors.slice(0, 5), total: statements.length };
  } catch (e) {
    return { error: e.message };
  }
}
