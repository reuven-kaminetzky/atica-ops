import { NextResponse } from 'next/server';

/**
 * POST /api/sync
 * 
 * Pulls live data from Shopify and updates Postgres:
 * 1. Products → match to MPs → update shopify_product_ids, hero_image
 * 2. Inventory → update total_inventory per MP across all locations
 * 3. Orders (30 days) → compute velocity_per_week, sell_through, signal
 * 
 * This is the heartbeat. Run it on demand or on a schedule.
 */
export async function POST() {
  const started = Date.now();

  try {
    const { createClient } = require('../../../lib/shopify');
    const { matchProduct } = require('../../../lib/products');
    const { classifyDemand, adjustVelocity } = require('../../../lib/products');
    const { normalize } = require('../../../lib/locations');
    const { neon } = require('@netlify/neon');
    const sql = neon();

    const client = await createClient();
    if (!client) return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });

    const results = { products: 0, matched: 0, inventory: 0, velocity: 0, errors: [] };

    // ── 1. Products: match Shopify → MPs ──────────────────────

    const { products } = await client.getProducts();
    results.products = products.length;

    const mpMatches = {};  // mpId → { shopifyIds: [], images: [] }

    for (const p of products) {
      const mpId = matchProduct(p.title, parseFloat(p.variants?.[0]?.price || 0));
      if (mpId) {
        if (!mpMatches[mpId]) mpMatches[mpId] = { shopifyIds: [], images: [] };
        mpMatches[mpId].shopifyIds.push(p.id);
        if (p.image?.src) mpMatches[mpId].images.push(p.image.src);
        results.matched++;
      }
    }

    // Update MPs with Shopify IDs and hero images
    for (const [mpId, data] of Object.entries(mpMatches)) {
      try {
        await sql`
          UPDATE master_products SET 
            shopify_product_ids = ${data.shopifyIds},
            hero_image = ${data.images[0] || null}
          WHERE id = ${mpId}
        `;
      } catch (e) {
        results.errors.push({ type: 'product_update', mpId, error: e.message.slice(0, 80) });
      }
    }

    // ── 2. Inventory: stock per MP across all locations ────────

    const { locations } = await client.getLocations();
    const stockByMP = {};  // mpId → total available

    for (const loc of locations) {
      try {
        const { inventory_levels } = await client.getInventoryLevels(loc.id);
        for (const level of inventory_levels) {
          // Find which product this inventory item belongs to
          for (const p of products) {
            for (const v of (p.variants || [])) {
              if (v.inventory_item_id === level.inventory_item_id) {
                const mpId = matchProduct(p.title, parseFloat(v.price || 0));
                if (mpId) {
                  stockByMP[mpId] = (stockByMP[mpId] || 0) + (level.available || 0);
                }
              }
            }
          }
        }
      } catch (e) {
        results.errors.push({ type: 'inventory', location: loc.name, error: e.message.slice(0, 80) });
      }
    }

    // Update inventory in DB
    for (const [mpId, stock] of Object.entries(stockByMP)) {
      try {
        await sql`UPDATE master_products SET total_inventory = ${stock} WHERE id = ${mpId}`;
        results.inventory++;
      } catch (e) {
        results.errors.push({ type: 'stock_update', mpId, error: e.message.slice(0, 80) });
      }
    }

    // ── 3. Orders: velocity + demand signals (30 days) ────────

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { orders } = await client.getOrders({ created_at_min: since.toISOString() });

    const salesByMP = {};  // mpId → { units, revenue }

    for (const order of orders) {
      for (const li of (order.line_items || [])) {
        // Find parent product to match to MP
        const product = products.find(p =>
          p.variants?.some(v => v.id === li.variant_id)
        );
        if (product) {
          const mpId = matchProduct(product.title, parseFloat(li.price || 0));
          if (mpId) {
            if (!salesByMP[mpId]) salesByMP[mpId] = { units: 0, revenue: 0 };
            salesByMP[mpId].units += li.quantity;
            salesByMP[mpId].revenue += parseFloat(li.price || 0) * li.quantity;
          }
        }
      }
    }

    // Compute velocity and demand signals
    const DAYS = 30;
    const WEEKS = DAYS / 7;
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
            velocity_per_week = ${velocity},
            sell_through = ${sellThrough},
            days_of_stock = ${daysOfStock},
            signal = ${signal}
          WHERE id = ${mpId}
        `;
        results.velocity++;
      } catch (e) {
        results.errors.push({ type: 'velocity_update', mpId, error: e.message.slice(0, 80) });
      }
    }

    const elapsed = Date.now() - started;

    return NextResponse.json({
      synced: true,
      elapsed: `${elapsed}ms`,
      shopify: {
        products: results.products,
        matched: results.matched,
        unmatched: results.products - results.matched,
        locations: locations.length,
        orders: orders.length,
      },
      updated: {
        inventory: results.inventory,
        velocity: results.velocity,
      },
      errors: results.errors.slice(0, 10),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
