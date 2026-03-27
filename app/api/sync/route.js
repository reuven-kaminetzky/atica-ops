import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * Extract colorway from a Shopify product title.
 * "Half Canvas Suit | Lorenzo A | Drop 6 | Navy" → "Navy"
 * "Everyday Blue Gingham Shirt" → "Blue Gingham"
 * "Londoner White Shirt" → "White"
 */
function extractColorway(title) {
  if (!title) return null;
  // Pipe-separated: last segment is usually the colorway
  if (title.includes('|')) {
    const parts = title.split('|').map(s => s.trim());
    const last = parts[parts.length - 1];
    // Skip if last part is a fit/drop descriptor
    if (/drop\s+\d|lapel|classic|slim/i.test(last)) return parts.length > 2 ? parts[parts.length - 2].trim() : null;
    return last || null;
  }
  // Strip known MP/product type words and what's left is the colorway
  let color = title
    .replace(/\b(shirt|suit|pant|pants|blazer|coat|sweater|polo|glove|scarf|belt|sock|sneaker|vest|kapote|hat|cap|oxford|derby|loafer|monk)\b/gi, '')
    .replace(/\b(londoner|milano|edinburgh|firenze|tokyo|yorkshire|boston|providence|greenwich|oxfordshire|riviera|everyday|essential|parkway|luxury|performance|half\s+canvas|italian\s+fabric|baseball|rudy|laceless|fakelace|dress|wingtip|cashmere|nappa|leather|napa|baby\s+alpaca|quarter\s+zip|comfy|pull\s+over|viscose|wool|collared|standing\s+collar|car)\b/gi, '')
    .replace(/\b(modern|contemporary|classic|extra\s+slim|slim|regular|relaxed|men'?s|atica\s+man|w\s+flap|86025|blend|lined|touch\s*screen|hand\s*stitched|merino|rabbit\s+fur|check(ed)?|stripe[ds]?|gingham|grid|poplin|tonal|textured|micro|mini|double|light|solid|re-?defined|re-?stock|do\s+not\s+use)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  return color || null;
}

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
    const product = require('../../../lib/product');
    const { REORDER_VELOCITY_DAYS, SEASONAL_MULTIPLIERS } = require('../../../lib/constants');

    // Product domain gives us matching + DB writes
    const { matchProduct, classifyDemand, adjustVelocity } = product;

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
        await db`UPDATE master_products SET external_ids = ${data.shopifyIds}, hero_image = ${data.images[0] || null} WHERE id = ${mpId}`;
        mpUpdated++;
      } catch (e) { log.push(`mp_err:${mpId}:${e.message.slice(0, 40)}`); }
    }
    log.push(`mp_updated:${mpUpdated}`);

    // Create style records — each matched Shopify product is a style (colorway)
    let stylesCreated = 0;
    for (const p of products) {
      const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = matchProduct(p.title, maxPrice);
      if (!mpId) continue;

      const colorway = extractColorway(p.title);
      const totalInv = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
      const tags = typeof p.tags === 'string' ? p.tags.split(',').map(t => t.trim()).filter(Boolean) : (p.tags || []);

      try {
        await db`
          INSERT INTO styles (id, mp_id, external_product_id, title, colorway, hero_image, retail, inventory, variant_count, external_handle, tags, status)
          VALUES (${String(p.id)}, ${mpId}, ${p.id}, ${p.title}, ${colorway}, ${p.image?.src || null},
            ${maxPrice}, ${totalInv}, ${(p.variants || []).length}, ${p.handle || null}, ${tags},
            ${p.status === 'active' ? 'active' : 'archived'})
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title, colorway = EXCLUDED.colorway, hero_image = EXCLUDED.hero_image,
            retail = EXCLUDED.retail, inventory = EXCLUDED.inventory, variant_count = EXCLUDED.variant_count,
            tags = EXCLUDED.tags, status = EXCLUDED.status, updated_at = NOW()
        `;
        stylesCreated++;
      } catch (e) {
        // Table might not exist yet (migration not run) — silently skip
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
        products: products.length, matched: Object.keys(mpMatches).length,
        matchedMPs: Object.keys(mpMatches).length, styles: stylesCreated,
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
          await db`UPDATE master_products SET total_inventory = ${stock} WHERE id = ${mpId}`;
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
          await db`UPDATE master_products SET velocity_per_week=${vel}, sell_through=${st}, days_of_stock=${dos}, signal=${sig} WHERE id=${mpId}`;
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
