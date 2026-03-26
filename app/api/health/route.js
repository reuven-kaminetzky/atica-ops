import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { neon } = require('@netlify/neon');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ connected: false, error: 'No DATABASE_URL' });

    const sql = neon(url);
    const [result] = await sql`SELECT NOW() as time`;

    const counts = await sql`
      SELECT 
        (SELECT COUNT(*) FROM master_products) as products,
        (SELECT COUNT(*) FROM vendors) as vendors,
        (SELECT COUNT(*) FROM purchase_orders) as pos,
        (SELECT COUNT(*) FROM purchase_orders WHERE stage NOT IN ('received','distribution')) as active_pos,
        (SELECT COUNT(*) FROM po_payments WHERE status IN ('due','overdue')) as payments_due,
        (SELECT COUNT(*) FROM shipments) as shipments
    `;

    return NextResponse.json({
      connected: true,
      database: 'postgres',
      time: result.time,
      ...counts[0],
    });
  } catch (e) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 500 });
  }
}
