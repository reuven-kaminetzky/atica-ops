import { NextResponse } from 'next/server';

/**
 * Extract colorway from title.
 */
function extractColorway(title) {
  if (!title) return null;
  if (title.includes('|')) {
    const parts = title.split('|').map(s => s.trim());
    const last = parts[parts.length - 1];
    if (/drop\s+\d|lapel|classic|slim/i.test(last)) return parts.length > 2 ? parts[parts.length - 2].trim() : null;
    return last || null;
  }
  return null; // non-pipe titles: colorway IS the title variation, extract later
}

/** GET /api/sync — connection test */
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
 * POST /api/sync?step=products|inventory|orders|styles
 * 
 * Each step does ONE thing in under 20 seconds.
 *   products:  fetch from Shopify → match to MPs → update external_ids + hero_image
 *   inventory: compute stock from variant data (products must be fetched first)
 *   orders:    pull 30-day orders → store in sales table → compute velocity
 *   styles:    create style records from matched products (slower, separate step)
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
    const { searchParams } = new URL(request.url);
    const step = searchParams.get('step') || 'products';

    const client = await createClient();
    if (!client) return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });

    // ── STEP 1: PRODUCTS ── match Shopify → MPs (fast, no style writes)
    if (step === 'products') {
      const resp = await client.getProducts();
      const products = resp.products || resp || [];
      log.push(`fetched:${products.length}`);

      const mpMatches = {};
      const unmatched = [];
      for (const p of products) {
        if (/do not use/i.test(p.title)) continue;
        const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
        const mpId = matchProduct(p.title, maxPrice);
        if (mpId) {
          if (!mpMatches[mpId]) mpMatches[mpId] = { ids: [], img: null, count: 0, inv: 0 };
          mpMatches[mpId].ids.push(p.id);
          mpMatches[mpId].count++;
          mpMatches[mpId].inv += (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
          if (!mpMatches[mpId].img && p.image?.src) mpMatches[mpId].img = p.image.src;
        } else {
          unmatched.push(p.title);
        }
      }

      const totalMatched = Object.values(mpMatches).reduce((s, m) => s + m.count, 0);
      log.push(`matched:${totalMatched}/${products.length}`);

      // Update MPs — just external_ids + hero_image + inventory total
      let updated = 0;
      for (const [mpId, data] of Object.entries(mpMatches)) {
        try {
          await product.updateShopifyData(mpId, data.ids, data.img);
          await product.updateTotalInventory(mpId, data.inv);
          updated++;
        } catch (e) { log.push(`err:${mpId}:${e.message.slice(0, 30)}`); }
      }

      // Save last sync time
      try {
        const syncInfo = JSON.stringify({ time: new Date().toISOString(), matched: totalMatched, products: products.length });
        await db`INSERT INTO app_settings (key, value) VALUES ('last_sync', ${syncInfo}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
      } catch (e) { /* non-critical */ }

      return NextResponse.json({
        synced: true, step: 'products',
        elapsed: `${Date.now() - started}ms`,
        shopifyProducts: products.length,
        matched: totalMatched,
        unmatched: unmatched.filter(t => !/gift card|IB-AR|IBASTOM|shipping|ship\b|shatnez|tailoring|no shiping|Kupat|New Combo|^Suit$|^SuitC$|^SuitD$|^ship$/i.test(t)).slice(0, 30),
        mpsUpdated: updated,
        byMP: Object.fromEntries(Object.entries(mpMatches).map(([k, v]) => [k, { styles: v.count, inventory: v.inv }])),
        log,
      });
    }

    // ── STEP 2: STYLES ── create style records (separate step, can be slow)
    if (step === 'styles') {
      const resp = await client.getProducts();
      const products = resp.products || resp || [];

      // Build batch data
      const rows = [];
      let skipped = 0;
      for (const p of products) {
        if (/do not use/i.test(p.title)) continue;
        const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
        const mpId = matchProduct(p.title, maxPrice);
        if (!mpId) { skipped++; continue; }
        const totalInv = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
        rows.push([
          String(p.id), mpId, p.id, p.title, extractColorway(p.title) || null,
          p.image?.src || null, maxPrice, totalInv, (p.variants || []).length,
          p.handle || null, p.status === 'active' ? 'active' : 'archived',
        ]);
      }
      log.push(`rows_to_insert:${rows.length}`);

      // Batch insert using Pool (one query per batch of 100)
      let created = 0;
      try {
        const { Pool } = require('@neondatabase/serverless');
        const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
        const BATCH = 100;

        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const values = [];
          const placeholders = batch.map((row, ri) => {
            const offset = ri * 11;
            row.forEach(v => values.push(v));
            return `($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5},$${offset+6},$${offset+7},$${offset+8},$${offset+9},$${offset+10},$${offset+11})`;
          }).join(',');

          await pool.query(`
            INSERT INTO styles (id, mp_id, external_product_id, title, colorway, hero_image, retail, inventory, variant_count, external_handle, status)
            VALUES ${placeholders}
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title, colorway = EXCLUDED.colorway, hero_image = EXCLUDED.hero_image,
              retail = EXCLUDED.retail, inventory = EXCLUDED.inventory, variant_count = EXCLUDED.variant_count,
              status = EXCLUDED.status, updated_at = NOW()
          `, values);
          created += batch.length;
        }
        await pool.end();
      } catch (e) {
        if (e.message.includes('does not exist')) {
          return NextResponse.json({ error: 'Styles table missing. Run Migration first.', log });
        }
        log.push(`batch_err:${e.message.slice(0, 60)}`);
      }

      return NextResponse.json({
        synced: true, step: 'styles',
        elapsed: `${Date.now() - started}ms`,
        created, skipped, log,
      });
    }

    // ── STEP 3: INVENTORY ── just update totals from what step 1 already stored
    if (step === 'inventory') {
      // Inventory was already computed in step 1 (products).
      // This step exists for re-pulling per-location data if needed.
      // For now, just confirm what's in the DB.
      const mps = await db`SELECT id, name, total_inventory FROM master_products WHERE total_inventory > 0 ORDER BY total_inventory DESC LIMIT 20`;
      return NextResponse.json({
        synced: true, step: 'inventory',
        elapsed: `${Date.now() - started}ms`,
        note: 'Inventory updated during Products step. This shows current state.',
        mpsWithStock: mps.length,
        top: mps.map(m => ({ id: m.id, name: m.name, units: m.total_inventory })),
      });
    }

    // ── STEP 4: ORDERS ── pull recent orders, store in sales table, compute velocity
    if (step === 'orders') {
      const since = new Date();
      since.setDate(since.getDate() - REORDER_VELOCITY_DAYS);
      const ordResp = await client.getOrders({ created_at_min: since.toISOString() });
      const orders = ordResp.orders || ordResp || [];
      log.push(`orders:${orders.length}`);

      let salesStored = 0;
      const salesByMP = {};

      for (const order of orders) {
        const channel = order.source_name === 'pos' ? 'POS' : 'Online';
        for (const li of (order.line_items || [])) {
          const mpId = li.title ? matchProduct(li.title) : null;
          if (mpId) {
            if (!salesByMP[mpId]) salesByMP[mpId] = { units: 0, revenue: 0 };
            salesByMP[mpId].units += li.quantity;
            salesByMP[mpId].revenue += (parseFloat(li.price) || 0) * li.quantity;
          }
          // Store in sales table
          try {
            await db`
              INSERT INTO sales (order_id, order_shopify_id, ordered_at, store, mp_id, sku, title, quantity, unit_price, total, customer_name)
              VALUES (${order.name || String(order.id)}, ${order.id}, ${order.created_at}, ${channel}, ${mpId},
                ${li.sku || null}, ${li.title || null}, ${li.quantity || 1},
                ${parseFloat(li.price) || 0}, ${(parseFloat(li.price) || 0) * (li.quantity || 1)},
                ${order.customer?.first_name ? `${order.customer.first_name} ${order.customer.last_name || ''}`.trim() : null})
              ON CONFLICT DO NOTHING
            `;
            salesStored++;
          } catch (e) {
            if (salesStored === 0 && e.message.includes('does not exist')) {
              log.push('sales_table_missing'); break;
            }
          }
        }
      }

      // Compute velocity
      const WEEKS = REORDER_VELOCITY_DAYS / 7;
      const month = new Date().getMonth() + 1;
      let velUpdated = 0;

      for (const [mpId, sales] of Object.entries(salesByMP)) {
        const rawVel = +(sales.units / WEEKS).toFixed(2);
        const vel = +adjustVelocity(rawVel, month).toFixed(2);
        const sig = vel >= 5 ? 'hot' : vel >= 2 ? 'rising' : vel >= 0.5 ? 'steady' : 'slow';
        try {
          await product.updateVelocity(mpId, { velocity: vel, sellThrough: 0, daysOfStock: 0, signal: sig });
          velUpdated++;
        } catch (e) { /* skip */ }
      }

      return NextResponse.json({
        synced: true, step: 'orders',
        elapsed: `${Date.now() - started}ms`,
        orders: orders.length, salesStored, velocityUpdated: velUpdated,
        seasonal: { month, multiplier: SEASONAL_MULTIPLIERS[month] || 1.0 },
        log,
      });
    }

    return NextResponse.json({ error: `Unknown step: ${step}. Use products, styles, inventory, or orders.` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({
      error: e.message,
      stack: e.stack?.split('\n').slice(0, 5),
      log, elapsed: `${Date.now() - started}ms`,
    }, { status: 500 });
  }
}
