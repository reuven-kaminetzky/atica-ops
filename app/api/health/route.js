import { NextResponse } from 'next/server';
import { neon } from '@netlify/neon';

export async function GET() {
  try {
    const sql = neon();
    const counts = await sql`
      SELECT 
        (SELECT COUNT(*)::int FROM master_products) as products,
        (SELECT COUNT(*)::int FROM vendors) as vendors,
        (SELECT COUNT(*)::int FROM purchase_orders) as pos,
        (SELECT COUNT(*)::int FROM purchase_orders WHERE stage NOT IN ('received','distribution')) as active_pos
    `;
    return NextResponse.json({ connected: true, database: 'postgres', ...counts[0] });
  } catch (e) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 500 });
  }
}
