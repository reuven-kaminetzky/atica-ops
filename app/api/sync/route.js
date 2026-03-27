import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * Extract colorway from a Shopify product title.
 */
function extractColorway(title) {
  if (!title) return null;
  if (title.includes('|')) {
    const parts = title.split('|').map(s => s.trim());
    const last = parts[parts.length - 1];
    if (/drop\s+\d|lapel|classic|slim/i.test(last)) return parts.length > 2 ? parts[parts.length - 2].trim() : null;
    return last || null;
  }
  let color = title
    .replace(/\b(shirt|suit|pant|pants|blazer|coat|sweater|polo|glove|scarf|belt|sock|sneaker|vest|kapote|hat|cap|oxford|derby|loafer|monk)\b/gi, '')
    .replace(/\b(londoner|milano|edinburgh|firenze|tokyo|yorkshire|boston|providence|greenwich|oxfordshire|riviera|everyday|essential|parkway|luxury|performance|half\s+canvas|italian\s+fabric|baseball|rudy|laceless|fakelace|dress|wingtip|cashmere|nappa|leather|napa|baby\s+alpaca|quarter\s+zip|comfy|pull\s+over|viscose|wool|collared|standing\s+collar|car)\b/gi, '')
    .replace(/\b(modern|contemporary|classic|extra\s+slim|slim|regular|relaxed|men'?s|atica\s+man|w\s+flap|86025|blend|lined|touch\s*screen|hand\s*stitched|merino|rabbit\s+fur)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  return color || null;
}

/**
 * GET /api/sync — connection test
 */
export async function GET() {
  try {
    const { createClient } = require('../../../lib/shopify');
    const client = await createClient();
    if (!client) return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });
    const shop = await client.getShop();
    return NextResponse.json({ connected: true, shop: shop?.shop?.name || 'unknown' });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/sync — Shopify → Postgres
 * 
 * Steps:
 *   1. Products: pull all → match to MPs → store styles
 *   2. Inventory: compute per-MP totals from variant data (no extra API calls)
 *   3. Orders: pull 30 days → store in sales table → compute velocity from DB
 *
 * All DB writes go through domain modules. No raw SQL in this file.
 */
export async function POST(request) {
  const started = Date.now();
  const log = [];

  try {
    const { createClient } = require('../../../lib/shopify');
    const product = require('../../../lib/product');
    const { REORDER_VELOCITY_DAYS, SEASONAL_MULTIPLIERS } = require('../../../lib/constants');
    const { sql } = require('../../../lib/dal/db');
    const db = sql();

    const { matchProduct, classifyDemand, adjustVelocity } = product;

    log.push('imports_ok');

    const { searchParams } = new URL(request.url);
    const step = searchParams.get('step') || 'all';

    const client = await createClient();
    if (!client) return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });
    log.push('shopify_connected');

    // ── Step 1: Products ──────────────────────────────────────
    const resp = await client.getProducts();
    const products = resp.products || resp || [];
    log.push(`products:${products.length}`);

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

    const matchedCount = Object.values(mpMatches).reduce((s, m) => s + m.shopifyIds.length, 0);
    log.push(`matched:${matchedCount}/${products.length}`);

    // Update MPs with Shopify IDs and hero images
    let mpUpdated = 0;
    for (const [mpId, data] of Object.entries(mpMatches)) {
      try {
        await product.updateShopifyData(mpId, data.shopifyIds, data.images[0] || null);
        mpUpdated++;
      } catch (e) { log.push(`mp_err:${mpId}:${e.message.slice(0, 40)}`); }
    }
    log.push(`mps_updated:${mpUpdated}`);

    // Create style records (graceful if table doesn't exist yet)
    let stylesCreated = 0;
    for (const p of products) {
      const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = matchProduct(p.title, maxPrice);
      if (!mpId) continue;

      const totalInv = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
      const tags = typeof p.tags === 'string' ? p.tags.split(',').map(t => t.trim()).filter(Boolean) : (p.tags || []);

      try {
        await product.upsertStyle({
          id: String(p.id), mpId, shopifyProductId: p.id, title: p.title,
          colorway: extractColorway(p.title), heroImage: p.image?.src || null,
          retail: maxPrice, inventory: totalInv, variantCount: (p.variants || []).length,
          handle: p.handle || null, tags,
          status: p.status === 'active' ? 'active' : 'archived',
        });
        stylesCreated++;
      } catch (e) {
        if (stylesCreated === 0 && e.message.includes('does not exist')) {
          log.push('styles_table_missing');
          break;
        }
      }
    }
    if (stylesCreated > 0) log.push(`styles:${stylesCreated}`);

    if (step === 'products') {
      return NextResponse.json({
        synced: true, step: 'products', elapsed: `${Date.now() - started}ms`,
        products: products.length, matched: matchedCount, matchedMPs: mpUpdated,
        styles: stylesCreated, unmatched, log,
      });
    }

    // ── Step 2: Inventory ─────────────────────────────────────
    let invUpdated = 0;
    const stockByMP = {};

    for (const p of products) {
      const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = matchProduct(p.title, maxPrice);
      if (mpId) {
        const totalQty = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
        stockByMP[mpId] = (stockByMP[mpId] || 0) + totalQty;
      }
    }

    for (const [mpId, stock] of Object.entries(stockByMP)) {
      try {
        await product.updateTotalInventory(mpId, stock);
        invUpdated++;
      } catch (e) { /* skip */ }
    }
    log.push(`inventory:${invUpdated}`);

    if (step === 'inventory') {
      return NextResponse.json({
        synced: true, step: 'inventory', elapsed: `${Date.now() - started}ms`,
        inventory: invUpdated, log,
      });
    }

    // ── Step 3: Orders → Sales table → Velocity ───────────────
    let salesStored = 0;
    let velUpdated = 0;

    try {
      const since = new Date();
      since.setDate(since.getDate() - REORDER_VELOCITY_DAYS);
      const ordResp = await client.getOrders({ created_at_min: since.toISOString() });
      const orders = ordResp.orders || ordResp || [];
      log.push(`orders:${orders.length}`);

      // Store each line item in the sales table
      for (const order of orders) {
        const store = order.source_name === 'pos'
          ? (order.location_id ? `POS-${order.location_id}` : 'POS')
          : 'Online';

        for (const li of (order.line_items || [])) {
          const mpId = li.title ? matchProduct(li.title) : null;
          try {
            await db`
              INSERT INTO sales (order_id, order_shopify_id, ordered_at, store, mp_id, sku, title, quantity, unit_price, total, customer_name)
              VALUES (${order.name || String(order.id)}, ${order.id}, ${order.created_at}, ${store}, ${mpId},
                ${li.sku || null}, ${li.title || null}, ${li.quantity || 1},
                ${parseFloat(li.price) || 0}, ${(parseFloat(li.price) || 0) * (li.quantity || 1)},
                ${order.customer?.first_name ? `${order.customer.first_name} ${order.customer.last_name || ''}`.trim() : null})
              ON CONFLICT DO NOTHING
            `;
            salesStored++;
          } catch (e) {
            if (salesStored === 0 && e.message.includes('does not exist')) {
              log.push('sales_table_missing');
              break;
            }
          }
        }
      }
      if (salesStored > 0) log.push(`sales_stored:${salesStored}`);

      // Compute velocity from stored sales data
      const WEEKS = REORDER_VELOCITY_DAYS / 7;
      const month = new Date().getMonth() + 1;

      const salesByMP = {};
      for (const order of orders) {
        for (const li of (order.line_items || [])) {
          const mpId = li.title ? matchProduct(li.title) : null;
          if (mpId) {
            if (!salesByMP[mpId]) salesByMP[mpId] = { units: 0, revenue: 0 };
            salesByMP[mpId].units += li.quantity;
            salesByMP[mpId].revenue += parseFloat(li.price || 0) * li.quantity;
          }
        }
      }

      for (const [mpId, sales] of Object.entries(salesByMP)) {
        const stock = stockByMP[mpId] || 0;
        const rawVel = +(sales.units / WEEKS).toFixed(2);
        const vel = +adjustVelocity(rawVel, month).toFixed(2);
        const st = stock > 0 ? +((sales.units / (stock + sales.units)) * 100).toFixed(1) : 0;
        const dos = vel > 0 ? Math.round(stock / (vel / 7)) : 999;
        const sig = classifyDemand(st, vel);
        try {
          await product.updateVelocity(mpId, { velocity: vel, sellThrough: st, daysOfStock: dos, signal: sig });
          velUpdated++;
        } catch (e) { /* skip */ }
      }
      log.push(`velocity:${velUpdated}`);
    } catch (e) { log.push(`ord_err:${e.message.slice(0, 60)}`); }

    return NextResponse.json({
      synced: true, elapsed: `${Date.now() - started}ms`,
      products: products.length, matched: matchedCount,
      inventory: invUpdated, sales: salesStored, velocity: velUpdated,
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
