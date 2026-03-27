import { NextResponse } from 'next/server';

/**
 * POST /api/sync?step=products|inventory|orders
 * 
 * Split into 3 fast steps to avoid function timeout.
 * Call with no step param for products-only (fastest, most useful).
 */
export async function POST(request) {
  const started = Date.now();
  const { searchParams } = new URL(request.url);
  const step = searchParams.get('step') || 'products';

  try {
    const { createClient } = require('../../../lib/shopify');
    const { matchProduct, classifyDemand, adjustVelocity } = require('../../../lib/products');
    const { REORDER_VELOCITY_DAYS, SEASONAL_MULTIPLIERS } = require('../../../lib/constants');
    const { neon } = require('@netlify/neon');
    const sql = neon();

    const client = await createClient();
    if (!client) {
      return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });
    }

    // ── STEP: PRODUCTS ──────────────────────────────────────

    if (step === 'products') {
      const resp = await client.getProducts();
      const products = resp.products || [];

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

      // Update DB
      for (const [mpId, data] of Object.entries(mpMatches)) {
        try {
          await sql`
            UPDATE master_products SET 
              shopify_product_ids = ${data.shopifyIds},
              hero_image = ${data.images[0] || null}
            WHERE id = ${mpId}
          `;
        } catch (e) { /* skip */ }
      }

      return NextResponse.json({
        step: 'products',
        elapsed: `${Date.now() - started}ms`,
        total: products.length,
        matched: Object.keys(mpMatches).length,
        matchedProducts: Object.values(mpMatches).reduce((s, m) => s + m.shopifyIds.length, 0),
        unmatched,
        nextStep: 'inventory',
      });
    }

    // ── STEP: INVENTORY ─────────────────────────────────────

    if (step === 'inventory') {
      const resp = await client.getProducts();
      const products = resp.products || [];
      const locResp = await client.getLocations();
      const locations = locResp.locations || [];

      const stockByMP = {};

      for (const loc of locations) {
        try {
          const invResp = await client.getInventoryLevels(loc.id);
          const levels = invResp.inventory_levels || [];
          for (const level of levels) {
            for (const p of products) {
              for (const v of (p.variants || [])) {
                if (v.inventory_item_id === level.inventory_item_id) {
                  const maxPrice = Math.max(...(p.variants || []).map(vv => parseFloat(vv.price) || 0), 0);
                  const mpId = matchProduct(p.title, maxPrice);
                  if (mpId) {
                    stockByMP[mpId] = (stockByMP[mpId] || 0) + (level.available || 0);
                  }
                }
              }
            }
          }
        } catch (e) { /* skip location */ }
      }

      let updated = 0;
      for (const [mpId, stock] of Object.entries(stockByMP)) {
        try {
          await sql`UPDATE master_products SET total_inventory = ${stock} WHERE id = ${mpId}`;
          updated++;
        } catch (e) { /* skip */ }
      }

      return NextResponse.json({
        step: 'inventory',
        elapsed: `${Date.now() - started}ms`,
        locations: locations.length,
        productsWithStock: Object.keys(stockByMP).length,
        updated,
        nextStep: 'orders',
      });
    }

    // ── STEP: ORDERS (velocity + demand) ────────────────────

    if (step === 'orders') {
      const resp = await client.getProducts();
      const products = resp.products || [];

      const since = new Date();
      since.setDate(since.getDate() - REORDER_VELOCITY_DAYS);
      const ordResp = await client.getOrders({ created_at_min: since.toISOString() });
      const orders = ordResp.orders || [];

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
      const currentMonth = new Date().getMonth() + 1;
      let updated = 0;

      for (const [mpId, sales] of Object.entries(salesByMP)) {
        const rawVelocity = +(sales.units / WEEKS).toFixed(2);
        const velocity = +adjustVelocity(rawVelocity, currentMonth).toFixed(2);
        const signal = classifyDemand(sales.units > 0 ? 50 : 0, velocity);

        try {
          await sql`
            UPDATE master_products SET 
              velocity_per_week = ${velocity}, signal = ${signal}
            WHERE id = ${mpId}
          `;
          updated++;
        } catch (e) { /* skip */ }
      }

      return NextResponse.json({
        step: 'orders',
        elapsed: `${Date.now() - started}ms`,
        orders: orders.length,
        productsWithSales: Object.keys(salesByMP).length,
        updated,
        seasonal: {
          month: currentMonth,
          multiplier: SEASONAL_MULTIPLIERS[currentMonth] || 1.0,
        },
        done: true,
      });
    }

    return NextResponse.json({ error: `Unknown step: ${step}. Use products, inventory, or orders.` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({
      error: e.message,
      step,
      elapsed: `${Date.now() - started}ms`,
    }, { status: 500 });
  }
}
