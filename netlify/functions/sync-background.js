/**
 * netlify/functions/sync-background.js
 * 
 * Background function (15 minute timeout).
 * Runs the full Shopify → Postgres sync.
 * Status stored in app_settings (database) so Next.js routes can read it.
 * Shopify data cached in Netlify Blobs.
 * 
 * Triggered by: POST /.netlify/functions/sync-background
 * Returns: 202 immediately (background function contract)
 */

const { neon } = require('@netlify/neon');

// ── Status helper — writes to database (readable by Next.js routes) ──
async function setStatus(sql, status) {
  const value = JSON.stringify({ ...status, updatedAt: new Date().toISOString() });
  await sql`
    INSERT INTO app_settings (key, value) VALUES ('sync_status', ${value}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = ${value}::jsonb, updated_at = NOW()
  `;
}

function log(event, data = {}) {
  console.log(JSON.stringify({ event, ...data, ts: new Date().toISOString() }));
}

// ── Main sync logic ──────────────────────────────────────
exports.handler = async function(event) {
  const sql = neon();
  const started = Date.now();
  const results = {};

  try {
    await setStatus(sql, { status: 'running', step: 'connecting', startedAt: new Date().toISOString() });
    log('sync.started');

    // ── Connect to Shopify ─────────────────────────────
    const { createClient } = require('../../lib/shopify');
    const client = await createClient();
    if (!client) {
      await setStatus(sql, { status: 'failed', error: 'Shopify not configured' });
      log('sync.failed', { error: 'no client' });
      return;
    }

    // ── Step 1: Fetch all products ─────────────────────
    await setStatus(sql, { status: 'running', step: 'fetching_products' });
    const resp = await client.getProducts();
    const products = resp.products || resp || [];
    log('sync.products.fetched', { count: products.length });

    // Cache the Shopify data in a blob (optional — Blobs may not be configured)
    try {
      const { getStore } = require('@netlify/blobs');
      const blobStore = getStore('sync');
      await blobStore.setJSON('shopify-products', {
        fetchedAt: new Date().toISOString(),
        count: products.length,
        products: products.map(p => ({
          id: p.id, title: p.title, handle: p.handle, status: p.status,
          image: p.image?.src || null,
          variants: (p.variants || []).map(v => ({ id: v.id, price: v.price, inventory_quantity: v.inventory_quantity, sku: v.sku, option1: v.option1, option2: v.option2, option3: v.option3 })),
          options: (p.options || []).map(o => ({ name: o.name, position: o.position, values: o.values })),
          tags: p.tags,
        })),
      });
      log('sync.products.cached');
    } catch (e) { log('sync.products.cache_skip', { reason: e.message.slice(0, 60) }); }

    // ── Step 2: Match to MPs ───────────────────────────
    await setStatus(sql, { status: 'running', step: 'matching', products: products.length });
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
    // Race guard: only update total_inventory if the row hasn't been
    // modified since sync started (e.g., by a webhook). external_ids
    // and hero_image are always safe to overwrite.
    await setStatus(sql, { status: 'running', step: 'updating_mps', matched: totalMatched });
    const syncStartedAt = new Date(started).toISOString();
    let mpsUpdated = 0;
    let mpsSkippedRace = 0;
    for (const [mpId, data] of Object.entries(mpMatches)) {
      try {
        // Always update Shopify linkage (external_ids, hero_image)
        await sql`UPDATE master_products SET external_ids = ${data.ids}, hero_image = ${data.img} WHERE id = ${mpId}`;
        // Only update inventory if no webhook touched this MP since sync started
        const [result] = await sql`UPDATE master_products SET total_inventory = ${data.inv} WHERE id = ${mpId} AND updated_at <= ${syncStartedAt}::timestamptz RETURNING id`;
        if (result) {
          mpsUpdated++;
        } else {
          mpsSkippedRace++;
          log('sync.mp.race_skip', { mpId, reason: 'updated_at newer than sync start' });
        }
      } catch (e) {
        log('sync.mp.error', { mpId, error: e.message.slice(0, 80) });
      }
    }
    results.mpsUpdated = mpsUpdated;
    results.mpsSkippedRace = mpsSkippedRace;
    log('sync.mps.updated', { count: mpsUpdated });

    // ── Step 4: Upsert styles (batch) ───────────────────
    await setStatus(sql, { status: 'running', step: 'creating_styles', matched: totalMatched });
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
        await setStatus(sql, { status: 'running', step: 'creating_styles', progress: `${stylesCreated} styles` });
      }
    }
    results.stylesCreated = stylesCreated;
    results.styleErrors = styleErrors;
    log('sync.styles.done', { created: stylesCreated, errors: styleErrors });

    // ── Step 4b: Upsert SKUs from variant options ─────────
    // Each Shopify variant becomes a SKU row (fit + size + length).
    // Option mapping detected from product.options[].name.
    await setStatus(sql, { status: 'running', step: 'creating_skus', matched: totalMatched });
    let skusCreated = 0;
    let skuErrors = 0;

    for (const [mpId, data] of Object.entries(mpMatches)) {
      for (const p of data.products) {
        // Build option name → position map from product.options
        // e.g. { fit: 1, size: 2, length: 3 } or { size: 1 }
        const optMap = {};
        for (const opt of (p.options || [])) {
          const name = (opt.name || '').toLowerCase().trim();
          if (/fit|drop|style/i.test(name)) optMap.fit = opt.position;
          else if (/size/i.test(name)) optMap.size = opt.position;
          else if (/length|inseam/i.test(name)) optMap.length = opt.position;
          else if (/color|colour/i.test(name)) { /* skip color — already on style */ }
          else if (opt.position === 1 && !optMap.size) optMap.size = opt.position; // fallback: first option = size
        }

        const styleId = String(p.id);
        for (const v of (p.variants || [])) {
          const fit = optMap.fit ? (v[`option${optMap.fit}`] || null) : null;
          const size = optMap.size ? (v[`option${optMap.size}`] || null) : (v.option1 || null);
          const length = optMap.length ? (v[`option${optMap.length}`] || null) : null;

          if (!size && !fit) continue; // skip variants with no dimension data

          try {
            await sql`
              INSERT INTO skus (style_id, mp_id, fit, size, length, sku_code, shopify_variant_id, shopify_inventory_item_id)
              VALUES (${styleId}, ${mpId}, ${fit}, ${size}, ${length},
                ${v.sku || null}, ${v.id}, ${v.inventory_item_id || null})
              ON CONFLICT (shopify_variant_id) DO UPDATE SET
                fit = EXCLUDED.fit, size = EXCLUDED.size, length = EXCLUDED.length,
                sku_code = EXCLUDED.sku_code, is_active = true
            `;
            skusCreated++;
          } catch (e) {
            skuErrors++;
            if (skusCreated === 0 && e.message.includes('does not exist')) {
              log('sync.skus.table_missing');
              break;
            }
          }
        }
      }

      // Update status every 500 SKUs
      if (skusCreated % 500 === 0 && skusCreated > 0) {
        await setStatus(sql, { status: 'running', step: 'creating_skus', progress: `${skusCreated} SKUs` });
      }
    }
    results.skusCreated = skusCreated;
    results.skuErrors = skuErrors;
    log('sync.skus.done', { created: skusCreated, errors: skuErrors });

    // ── Step 5: Fetch orders (30 days) ──────────────────
    await setStatus(sql, { status: 'running', step: 'fetching_orders' });
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
    await setStatus(sql, { status: 'running', step: 'computing_velocity', orders: orders.length });
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
        try {
          await sql`
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
    await setStatus(sql, {
      status: 'done',
      completedAt,
      elapsed: results.elapsed,
      results,
    });

    // Store history and unmatched in Blobs (optional)
    try {
      const { getStore } = require('@netlify/blobs');
      const blobStore = getStore('sync');
      const historyKey = `sync-history/${completedAt.slice(0, 10)}/${completedAt.slice(11, 19).replace(/:/g, '')}`;
      await blobStore.setJSON(historyKey, { completedAt, results });
      if (unmatched.length > 0) {
        await blobStore.setJSON('unmatched-titles', { updatedAt: completedAt, count: unmatched.length, titles: unmatched });
      }
    } catch (e) { log('sync.blob_skip', { reason: e.message.slice(0, 60) }); }

    // Also store unmatched in database for the /api/sync/unmatched route
    // Filter out non-product noise (gift cards, shipping, internal codes)
    try {
      const realUnmatched = unmatched.filter(t => !/gift card|IB-AR|IBASTOM|shipping|ship\b|shatnez|tailoring|no shiping|Kupat|New Combo|^Suit$|^SuitC$|^SuitD$|^ship$|test|sample|placeholder/i.test(t));
      const unmatchedVal = JSON.stringify({ updatedAt: completedAt, count: realUnmatched.length, totalRaw: unmatched.length, titles: realUnmatched.slice(0, 200) });
      await sql`INSERT INTO app_settings (key, value) VALUES ('unmatched_titles', ${unmatchedVal}::jsonb) ON CONFLICT (key) DO UPDATE SET value = ${unmatchedVal}::jsonb, updated_at = NOW()`;
    } catch (e) { /* skip */ }

    log('sync.complete', results);

  } catch (e) {
    const elapsed = Date.now() - started;
    await setStatus(sql, {
      status: 'failed',
      error: e.message,
      elapsed: `${Math.round(elapsed / 1000)}s`,
      results,
    }).catch(() => {});
    log('sync.failed', { error: e.message, stack: e.stack?.split('\n').slice(0, 3) });
  }
};
