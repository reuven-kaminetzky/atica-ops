import { NextResponse } from 'next/server';

/**
 * POST /api/sync
 * 
 * Pulls live data from Shopify → updates Postgres.
 * Designed to not timeout: catches each step independently.
 */
export const maxDuration = 60; // Allow up to 60 seconds for full Shopify sync

export async function POST() {
  const started = Date.now();
  const results = { products: 0, matched: 0, inventory: 0, velocity: 0, errors: [], steps: [] };

  try {
    const { createClient } = require('../../../lib/shopify');
    const { matchProduct, classifyDemand, adjustVelocity } = require('../../../lib/products');
    const { REORDER_VELOCITY_DAYS, SEASONAL_MULTIPLIERS } = require('../../../lib/constants');
    const { neon } = require('@netlify/neon');
    const sql = neon();

    // Step 1: Connect to Shopify
    const client = await createClient();
    if (!client) {
      return NextResponse.json({ error: 'Shopify not configured — check SHOPIFY_ACCESS_TOKEN env var' }, { status: 503 });
    }
    results.steps.push('shopify_connected');

    // Step 2: Pull products
    let products = [];
    try {
      const resp = await client.getProducts();
      products = resp.products || resp || [];
      results.products = products.length;
      results.steps.push(`products_fetched:${products.length}`);
    } catch (e) {
      results.errors.push({ step: 'products', error: e.message.slice(0, 120) });
      return NextResponse.json({ ...results, elapsed: `${Date.now() - started}ms` });
    }

    // Step 3: Match products to MPs
    const mpMatches = {};
    for (const p of products) {
      const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = matchProduct(p.title, maxPrice);
      if (mpId) {
        if (!mpMatches[mpId]) mpMatches[mpId] = { shopifyIds: [], images: [] };
        mpMatches[mpId].shopifyIds.push(p.id);
        if (p.image?.src) mpMatches[mpId].images.push(p.image.src);
        results.matched++;
      }
    }
    results.steps.push(`matched:${results.matched}`);
    results.unmatched = products.filter(p => {
      const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
      return !matchProduct(p.title, maxPrice);
    }).map(p => p.title).slice(0, 20);

    // Step 4: Update MPs with Shopify IDs and hero images
    for (const [mpId, data] of Object.entries(mpMatches)) {
      try {
        await sql`
          UPDATE master_products SET 
            shopify_product_ids = ${data.shopifyIds},
            hero_image = ${data.images[0] || null}
          WHERE id = ${mpId}
        `;
      } catch (e) {
        results.errors.push({ step: 'mp_update', mpId, error: e.message.slice(0, 80) });
      }
    }
    results.steps.push('mps_updated');

    // Step 5: Pull inventory (just total per MP, skip per-location for speed)
    const stockByMP = {};
    try {
      const locations = await client.getLocations();
      const locs = locations.locations || locations || [];
      results.steps.push(`locations:${locs.length}`);

      for (const loc of locs) {
        try {
          const resp = await client.getInventoryLevels(loc.id);
          const levels = resp.inventory_levels || resp || [];
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
        } catch (e) {
          results.errors.push({ step: 'inventory_location', location: loc.name, error: e.message.slice(0, 80) });
        }
      }

      for (const [mpId, stock] of Object.entries(stockByMP)) {
        try {
          await sql`UPDATE master_products SET total_inventory = ${stock} WHERE id = ${mpId}`;
          results.inventory++;
        } catch (e) {
          results.errors.push({ step: 'stock_update', mpId, error: e.message.slice(0, 80) });
        }
      }
      results.steps.push(`inventory:${results.inventory}`);
    } catch (e) {
      results.errors.push({ step: 'inventory', error: e.message.slice(0, 120) });
    }

    // Step 6: Pull orders (30 days) for velocity
    try {
      const since = new Date();
      since.setDate(since.getDate() - REORDER_VELOCITY_DAYS);
      const resp = await client.getOrders({ created_at_min: since.toISOString() });
      const orders = resp.orders || resp || [];
      results.steps.push(`orders:${orders.length}`);

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

      for (const [mpId, sales] of Object.entries(salesByMP)) {
        const stock = stockByMP[mpId] || 0;
        const rawVelocity = +(sales.units / WEEKS).toFixed(2);
        const velocity = +adjustVelocity(rawVelocity, currentMonth).toFixed(2);
        const sellThrough = stock > 0 ? +((sales.units / (stock + sales.units)) * 100).toFixed(1) : 0;
        const daysOfStock = velocity > 0 ? Math.round(stock / (velocity / 7)) : 999;
        const signal = classifyDemand(sellThrough, velocity);

        try {
          await sql`
            UPDATE master_products SET 
              velocity_per_week = ${velocity}, sell_through = ${sellThrough},
              days_of_stock = ${daysOfStock}, signal = ${signal}
            WHERE id = ${mpId}
          `;
          results.velocity++;
        } catch (e) {
          results.errors.push({ step: 'velocity', mpId, error: e.message.slice(0, 80) });
        }
      }
      results.steps.push(`velocity:${results.velocity}`);
    } catch (e) {
      results.errors.push({ step: 'orders', error: e.message.slice(0, 120) });
    }

    return NextResponse.json({
      synced: true,
      elapsed: `${Date.now() - started}ms`,
      matched: results.matched,
      unmatched: results.unmatched,
      inventory: results.inventory,
      velocity: results.velocity,
      steps: results.steps,
      seasonal: {
        month: new Date().getMonth() + 1,
        multiplier: SEASONAL_MULTIPLIERS[new Date().getMonth() + 1] || 1.0,
      },
      errors: results.errors.slice(0, 10),
    });
  } catch (e) {
    return NextResponse.json({
      error: e.message,
      stack: e.stack?.split('\n').slice(0, 3),
      results,
      elapsed: `${Date.now() - started}ms`,
    }, { status: 500 });
  }
}
