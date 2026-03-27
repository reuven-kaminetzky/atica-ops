import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { name } = await params;
    const store = decodeURIComponent(name);
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();

    // Low stock products
    const lowStock = await db`
      SELECT id, name, code, category, total_inventory, days_of_stock, signal, velocity_per_week
      FROM master_products
      WHERE (total_inventory < 20 OR days_of_stock < 60)
      ORDER BY COALESCE(total_inventory, 0) ASC
      LIMIT 20
    `;

    // Incoming transfers for this store
    let incoming = [];
    try {
      incoming = await db`
        SELECT id, from_location, status, total_units, items, delivered_at, created_at
        FROM transfers
        WHERE to_location = ${store} AND status IN ('planned', 'picked', 'loaded', 'in_transit', 'delivered')
        ORDER BY created_at DESC
        LIMIT 10
      `;
    } catch (e) { /* table might not exist yet */ }

    // Upcoming POs (shipped or in_transit)
    const upcomingPOs = await db`
      SELECT id, mp_id, mp_name, vendor_name, stage, units, eta
      FROM purchase_orders
      WHERE stage IN ('shipped', 'in_transit', 'production', 'qc', 'ordered')
      ORDER BY eta ASC NULLS LAST
      LIMIT 10
    `;

    // Today's sales placeholder (will be from Shopify POS)
    const totalStock = lowStock.length > 0
      ? (await db`SELECT SUM(COALESCE(total_inventory, 0))::int AS n FROM master_products`)[0].n
      : 0;

    return NextResponse.json({
      store,
      todayRevenue: 0,  // from Shopify POS when wired
      todayOrders: 0,
      todayAOV: 0,
      totalStock,
      lowStock,
      incoming,
      upcomingPOs,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
