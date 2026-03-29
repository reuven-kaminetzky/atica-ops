/**
 * netlify/functions/sync-background.js
 * 
 * Background function (15 minute timeout).
 * Runs the full Shopify → Postgres sync.
 * Uses Netlify Blobs for status tracking (fast) and Shopify data caching.
 * Business data writes go to Postgres.
 * 
 * Triggered by: POST /.netlify/functions/sync-background
 * Returns: 202 immediately (background function contract)
 */

const { neon } = require('@netlify/neon');
const { getStore } = require('@netlify/blobs');

// ── Status helper — writes to Blob (fast, no SQL) ────────
async function setStatus(store, status) {
  await store.setJSON('sync-status', { ...status, updatedAt: new Date().toISOString() });
}

function log(event, data = {}) {
  console.log(JSON.stringify({ event, ...data, ts: new Date().toISOString() }));
}

// ── Main sync logic ──────────────────────────────────────
exports.handler = async function(event) {
  const sql = neon();
  const store = getStore('sync');
  const started = Date.now();
  const results = {};

  try {
    await setStatus(store, { status: 'running', step: 'connecting', startedAt: new Date().toISOString() });
    log('sync.started');

    // ── Connect to Shopify ─────────────────────────────
    const { createClient } = require('../../lib/shopify');
    const client = await createClient();
    if (!client) {
      await setStatus(store, { status: 'failed', error: 'Shopify not configured' });
      log('sync.failed', { error: 'no client' });
      return;
    }

    // ── Step 1: Fetch all products ─────────────────────
    await setStatus(store, { status: 'running', step: 'fetching_products' });
    const resp = await client.getProducts();
    const products = resp.products || resp || [];
    log('sync.products.fetched', { count: products.length });

    // Cache the Shopify data in a blob for other functions to use
    await store.setJSON('shopify-products', {
      fetchedAt: new Date().toISOString(),
      count: products.length,
      products: products.map(p => ({
        id: p.id, title: p.title, handle: p.handle, status: p.status,
        image: p.image?.src || null,
        variants: (p.variants || []).map(v => ({ id: v.id, price: v.price, inventory_quantity: v.inventory_quantity, sku: v.sku })),
        tags: p.tags,
      })),
    });
    log('sync.products.cached');

    // ── Step 2: Match to MPs ───────────────────────────
    await setStatus(store, { status: 'running', step: 'matching', products: products.length });
    const { matchProduct, classifyDemand, adjustVelocity } = require('../../lib/products');

    const mpMatches = {};
    const unmatched = [];
    for (const p of products) {
      if (/do not use/i.test(p.title)) continue;
      const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = matchProduct(p.title, maxPrice);
      if (mpId) {
        if (!mpMatches[mpId]) mpMatches[mpId] = { ids: [], img: null, count: 0, inv: 0, products: [] };
        mpMatches[mpId].ids.push(p.id);
        mpMatches[mpId].count++;
        mpMatches[mpId].inv += (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
        if (!mpMatches[mpId].img && p.image?.src) mpMatches[mpId].img = p.image.src;
        mpMatches[mpId].products.push(p);
      } else {
        unmatched.push(p.title);
      }
    }

    const totalMatched = Object.values(mpMatches).reduce((s, m) => s + m.count, 0);
    results.matched = totalMatched;
    results.unmatched = unmatched.length;
    log('sync.matched', { matched: totalMatched, unmatched: unmatched.length, mps: Object.keys(mpMatches).length });

    // ── Step 3: Update master_products ──────────────────
    await setStatus(store, { status: 'running', step: 'updating_mps', matched: totalMatched });
    let mpsUpdated = 0;
    for (const [mpId, data] of Object.entries(mpMatches)) {
      try {
        await sql`UPDATE master_products SET external_ids = ${data.ids}, hero_image = ${data.img}, total_inventory = ${data.inv} WHERE id = ${mpId}`;
        mpsUpdated++;
      } catch (e) {
        log('sync.mp.error', { mpId, error: e.message.slice(0, 80) });
      }
    }
    results.mpsUpdated = mpsUpdated;
    log('sync.mps.updated', { count: mpsUpdated });

    // ── Step 4: Upsert styles (batch) ───────────────────
    await setStatus(store, { status: 'running', step: 'creating_styles', matched: totalMatched });
    let stylesCreated = 0;
    let styleErrors = 0;

    for (const [mpId, data] of Object.entries(mpMatches)) {
      for (const p of data.products) {
        const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
        const totalInv = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
        const colorway = p.title.includes('|') ? p.title.split('|').pop().trim() : null;

        try {
          await sql`
            INSERT INTO styles (id, mp_id, external_product_id, title, colorway, hero_image, retail, inventory, variant_count, external_handle, status)
            VALUES (${String(p.id)}, ${mpId}, ${p.id}, ${p.title}, ${colorway}, ${p.image?.src || null},
              ${maxPrice}, ${totalInv}, ${(p.variants || []).length}, ${p.handle || null},
              ${p.status === 'active' ? 'active' : 'archived'})
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title, colorway = EXCLUDED.colorway, hero_image = EXCLUDED.hero_image,
              retail = EXCLUDED.retail, inventory = EXCLUDED.inventory, variant_count = EXCLUDED.variant_count,
              status = EXCLUDED.status, updated_at = NOW()
          `;
          stylesCreated++;
        } catch (e) {
          styleErrors++;
          if (stylesCreated === 0 && e.message.includes('does not exist')) {
            log('sync.styles.table_missing');
            break;
          }
        }
      }

      // Update status every 100 styles
      if (stylesCreated % 100 === 0 && stylesCreated > 0) {
        await setStatus(store, { status: 'running', step: 'creating_styles', progress: `${stylesCreated} styles` });
      }
    }
    results.stylesCreated = stylesCreated;
    results.styleErrors = styleErrors;
    log('sync.styles.done', { created: stylesCreated, errors: styleErrors });

    // ── Step 5: Fetch orders (30 days) ──────────────────
    await setStatus(store, { status: 'running', step: 'fetching_orders' });
    const { REORDER_VELOCITY_DAYS, SEASONAL_MULTIPLIERS } = require('../../lib/constants');
    const since = new Date();
    since.setDate(since.getDate() - REORDER_VELOCITY_DAYS);

    let orders = [];
    try {
      const ordResp = await client.getOrders({ created_at_min: since.toISOString() });
      orders = ordResp.orders || ordResp || [];
    } catch (e) {
      log('sync.orders.error', { error: e.message.slice(0, 80) });
    }
    results.orders = orders.length;
    log('sync.orders.fetched', { count: orders.length });

    // ── Step 6: Store sales + compute velocity ──────────
    await setStatus(store, { status: 'running', step: 'computing_velocity', orders: orders.length });
    let salesStored = 0;
    const salesByMP = {};

    for (const order of orders) {
      const store = order.source_name === 'pos' ? 'POS' : 'Online';
      for (const li of (order.line_items || [])) {
        const mpId = li.title ? matchProduct(li.title) : null;
        if (mpId) {
          if (!salesByMP[mpId]) salesByMP[mpId] = { units: 0, revenue: 0 };
          salesByMP[mpId].units += li.quantity;
          salesByMP[mpId].revenue += (parseFloat(li.price) || 0) * li.quantity;
        }
        try {
          await sql`
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
            log('sync.sales.table_missing');
            break;
          }
        }
      }
    }
    results.salesStored = salesStored;

    // Velocity
    const WEEKS = REORDER_VELOCITY_DAYS / 7;
    const month = new Date().getMonth() + 1;
    let velUpdated = 0;

    for (const [mpId, sales] of Object.entries(salesByMP)) {
      const stock = mpMatches[mpId]?.inv || 0;
      const rawVel = +(sales.units / WEEKS).toFixed(2);
      const vel = +adjustVelocity(rawVel, month).toFixed(2);
      const st = stock > 0 ? +((sales.units / (stock + sales.units)) * 100).toFixed(1) : 0;
      const dos = vel > 0 ? Math.round(stock / (vel / 7)) : 999;
      const sig = classifyDemand(st, vel);
      try {
        await sql`UPDATE master_products SET velocity_per_week=${vel}, sell_through=${st}, days_of_stock=${dos}, signal=${sig} WHERE id=${mpId}`;
        velUpdated++;
      } catch (e) {
        log('sync.velocity.error', { mpId, error: e.message.slice(0, 40) });
      }
    }
    results.velocityUpdated = velUpdated;
    log('sync.velocity.done', { updated: velUpdated });

    // ── Done ─────────────────────────────────────────────
    const elapsed = Date.now() - started;
    results.elapsed = `${Math.round(elapsed / 1000)}s`;

    const completedAt = new Date().toISOString();
    await setStatus(store, {
      status: 'done',
      completedAt,
      elapsed: results.elapsed,
      results,
    });

    // Store in sync history (keyed by date for audit trail)
    const historyKey = `sync-history/${completedAt.slice(0, 10)}/${completedAt.slice(11, 19).replace(/:/g, '')}`;
    await store.setJSON(historyKey, { completedAt, results });

    // Store unmatched titles for review
    if (unmatched.length > 0) {
      await store.setJSON('unmatched-titles', {
        updatedAt: completedAt,
        count: unmatched.length,
        titles: unmatched,
      });
    }

    log('sync.complete', results);

  } catch (e) {
    const elapsed = Date.now() - started;
    await setStatus(store, {
      status: 'failed',
      error: e.message,
      elapsed: `${Math.round(elapsed / 1000)}s`,
      results,
    }).catch(() => {});
    log('sync.failed', { error: e.message, stack: e.stack?.split('\n').slice(0, 3) });
  }
};
