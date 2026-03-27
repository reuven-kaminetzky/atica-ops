import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * POST /api/sync — Shopify → Postgres sync
 * GET /api/sync — quick connection test
 */
export async function GET() {
  try {
    const { createClient } = require('../../../lib/shopify');
    const client = await createClient();
    if (!client) return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });
    const shop = await client.getShop();
    return NextResponse.json({ connected: true, shop: shop?.shop?.name || 'unknown' });
  } catch (e) {
    return NextResponse.json({ error: e.message, stack: e.stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
}

export async function POST(request) {
  const started = Date.now();
  const log = [];

  try {
    const { createClient } = require('../../../lib/shopify');
    const { matchProduct, classifyDemand, adjustVelocity } = require('../../../lib/products');
    const { REORDER_VELOCITY_DAYS, SEASONAL_MULTIPLIERS } = require('../../../lib/constants');
    const { neon } = require('@netlify/neon');
    const sql = neon();

    log.push('imports_ok');

    // Check what step to run (default: all, but can do step=products to test)
    const { searchParams } = new URL(request.url);
    const step = searchParams.get('step') || 'all';

    const client = await createClient();
    if (!client) return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });
    log.push('shopify_connected');

    // Step 1: Products
    const resp = await client.getProducts();
    const products = resp.products || resp || [];
    log.push(`products:${products.length}`);

    // Match
    const mpMatches = {};
    const unmatched = [];
    for (const p of products) {
      const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = matchProduct(p.title, maxPrice);
      if (mpId) {
        if (!mpMatches[mpId]) mpMatches[mpId] = { shopifyIds: [], images: [] };
        mpMatches[mpId].shopifyIds.push(p.id);
        if (p.image?.src) mpMatches[mpId].images.push(p.image.src);
      } else {
        unmatched.push(p.title);
      }
    }
    log.push(`matched:${Object.keys(mpMatches).length}`);

    // Update MPs
    let mpUpdated = 0;
    for (const [mpId, data] of Object.entries(mpMatches)) {
      try {
        await sql`UPDATE master_products SET shopify_product_ids = ${data.shopifyIds}, hero_image = ${data.images[0] || null} WHERE id = ${mpId}`;
        mpUpdated++;
      } catch (e) { log.push(`mp_err:${mpId}:${e.message.slice(0, 40)}`); }
    }
    log.push(`mp_updated:${mpUpdated}`);

    if (step === 'products') {
      return NextResponse.json({
        synced: true, step: 'products', elapsed: `${Date.now() - started}ms`,
        products: products.length, matched: Object.keys(mpMatches).length,
        unmatched, log,
      });
    }

    // Step 2: Inventory — use variant data already fetched (NO extra API calls)
    let invUpdated = 0;
    const stockByMP = {};
    try {
      // Products already have inventory_quantity on each variant
      for (const p of products) {
        const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
        const mpId = matchProduct(p.title, maxPrice);
        if (mpId) {
          const totalQty = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
          stockByMP[mpId] = (stockByMP[mpId] || 0) + totalQty;
        }
      }
      log.push(`stock_mps:${Object.keys(stockByMP).length}`);

      for (const [mpId, stock] of Object.entries(stockByMP)) {
        try {
          await sql`UPDATE master_products SET total_inventory = ${stock} WHERE id = ${mpId}`;
          invUpdated++;
        } catch (e) { /* skip */ }
      }
      log.push(`inventory:${invUpdated}`);
    } catch (e) { log.push(`inv_err:${e.message.slice(0, 60)}`); }

    if (step === 'inventory') {
      return NextResponse.json({
        synced: true, step: 'inventory', elapsed: `${Date.now() - started}ms`,
        inventory: invUpdated, log,
      });
    }

    // Step 3: Orders + velocity
    let velUpdated = 0;
    try {
      const since = new Date();
      since.setDate(since.getDate() - REORDER_VELOCITY_DAYS);
      const ordResp = await client.getOrders({ created_at_min: since.toISOString() });
      const orders = ordResp.orders || ordResp || [];
      log.push(`orders:${orders.length}`);

      const salesByMP = {};
      for (const order of orders) {
        for (const li of (order.line_items || [])) {
          const product = products.find(p => p.variants?.some(v => v.id === li.variant_id));
          if (product) {
            const maxPrice = Math.max(...(product.variants || []).map(v => parseFloat(v.price) || 0), 0);
            const mpId = matchProduct(product.title, maxPrice);
            if (mpId) {
              if (!salesByMP[mpId]) salesByMP[mpId] = { units: 0, revenue: 0 };
              salesByMP[mpId].units += li.quantity;
              salesByMP[mpId].revenue += parseFloat(li.price || 0) * li.quantity;
            }
          }
        }
      }

      const WEEKS = REORDER_VELOCITY_DAYS / 7;
      const month = new Date().getMonth() + 1;
      for (const [mpId, sales] of Object.entries(salesByMP)) {
        const stock = stockByMP[mpId] || 0;
        const rawVel = +(sales.units / WEEKS).toFixed(2);
        const vel = +adjustVelocity(rawVel, month).toFixed(2);
        const st = stock > 0 ? +((sales.units / (stock + sales.units)) * 100).toFixed(1) : 0;
        const dos = vel > 0 ? Math.round(stock / (vel / 7)) : 999;
        const sig = classifyDemand(st, vel);
        try {
          await sql`UPDATE master_products SET velocity_per_week=${vel}, sell_through=${st}, days_of_stock=${dos}, signal=${sig} WHERE id=${mpId}`;
          velUpdated++;
        } catch (e) { /* skip */ }
      }
      log.push(`velocity:${velUpdated}`);
    } catch (e) { log.push(`ord_err:${e.message.slice(0, 60)}`); }

    return NextResponse.json({
      synced: true, elapsed: `${Date.now() - started}ms`,
      products: products.length, matched: Object.keys(mpMatches).length,
      unmatched: unmatched.slice(0, 20),
      inventory: invUpdated, velocity: velUpdated,
      seasonal: { month: new Date().getMonth() + 1, multiplier: SEASONAL_MULTIPLIERS[new Date().getMonth() + 1] || 1.0 },
      log,
    });
  } catch (e) {
    return NextResponse.json({
      error: e.message, stack: e.stack?.split('\n').slice(0, 5),
      log, elapsed: `${Date.now() - started}ms`,
    }, { status: 500 });
  }
}
