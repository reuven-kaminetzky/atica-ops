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
const { createClient } = require('../../lib/shopify');
const { matchProduct, classifyDemand, adjustVelocity } = require('../../lib/products');
const { REORDER_VELOCITY_DAYS, SEASONAL_MULTIPLIERS } = require('../../lib/constants');

// Blobs are optional — may not be configured
let getStore;
try { getStore = require('@netlify/blobs').getStore; } catch { getStore = null; }

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
      if (!getStore) throw new Error('Blobs not available');
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
    await setStatus(sql, { status: 'running', step: 'updating_mps', matched: totalMatched });
    
    // Detect column name: external_ids (post-migration 005) or shopify_product_ids (pre)
    let idsCol = 'external_ids';
    try {
      await sql`SELECT external_ids FROM master_products LIMIT 1`;
    } catch {
      idsCol = 'shopify_product_ids';
      log('sync.column_fallback', { using: idsCol });
    }

    let mpsUpdated = 0;
    for (const [mpId, data] of Object.entries(mpMatches)) {
      try {
        if (idsCol === 'external_ids') {
          await sql`UPDATE master_products SET external_ids = ${data.ids}, hero_image = ${data.img}, total_inventory = ${data.inv} WHERE id = ${mpId}`;
        } else {
          await sql`UPDATE master_products SET shopify_product_ids = ${data.ids}, hero_image = ${data.img}, total_inventory = ${data.inv} WHERE id = ${mpId}`;
        }
        mpsUpdated++;
      } catch (e) {
        log('sync.mp.error', { mpId, error: e.message.slice(0, 80) });
      }
    }
    results.mpsUpdated = mpsUpdated;
    results.idsColumn = idsCol;
    log('sync.mps.updated', { count: mpsUpdated, idsCol });

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
    // Shirt sleeve length: three options (fit + neck size + sleeve length)
    // Suit size+length: may be combined ("38R" → size=38, length=R)
    await setStatus(sql, { status: 'running', step: 'creating_skus', matched: totalMatched });
    let skusCreated = 0;
    let skuErrors = 0;
    const optionPatterns = {}; // track what patterns we find for debugging

    for (const [mpId, data] of Object.entries(mpMatches)) {
      for (const p of data.products) {
        // Build option name → position map from product.options
        const optMap = {};
        const optNames = [];
        for (const opt of (p.options || [])) {
          const name = (opt.name || '').toLowerCase().trim();
          optNames.push(opt.name);
          if (/fit|drop|style/i.test(name)) optMap.fit = opt.position;
          else if (/neck/i.test(name)) optMap.size = opt.position; // "Neck Size"
          else if (/sleeve/i.test(name)) optMap.length = opt.position; // "Sleeve Length"
          else if (/size/i.test(name)) optMap.size = opt.position;
          else if (/length|inseam/i.test(name)) optMap.length = opt.position;
          else if (/color|colour/i.test(name)) { /* skip — on style */ }
          else if (opt.position === 1 && !optMap.size) optMap.size = opt.position;
        }

        // Track option patterns for debugging
        const pattern = optNames.join(' | ') || 'no options';
        optionPatterns[pattern] = (optionPatterns[pattern] || 0) + 1;

        const styleId = String(p.id);
        for (const v of (p.variants || [])) {
          let fit = optMap.fit ? (v[`option${optMap.fit}`] || null) : null;
          let size = optMap.size ? (v[`option${optMap.size}`] || null) : (v.option1 || null);
          let length = optMap.length ? (v[`option${optMap.length}`] || null) : null;

          // Split combined size+length for suits (e.g., "38R" → size=38, length=R)
          if (size && !length && /^\d+[SRLT]$/i.test(size)) {
            length = size.slice(-1).toUpperCase();
            size = size.slice(0, -1);
          }

          if (!size && !fit) continue;

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
    results.optionPatterns = optionPatterns;
    log('sync.skus.done', { created: skusCreated, errors: skuErrors, patterns: optionPatterns });

    // ── Step 4c: Inventory — seed once, reconcile after ──
    // First sync: insert initial_seed events from Shopify inventory levels.
    // Subsequent syncs: compare our SUM(events) vs Shopify's current level.
    // If they differ, insert a reconciliation event with the delta.
    // Between syncs, webhooks handle changes in real-time.
    await setStatus(sql, { status: 'running', step: 'inventory_reconciliation' });
    let invSeeded = 0;
    let invReconciled = 0;
    let invOk = 0;
    try {
      const { locations: shopifyLocations } = await client.getLocations();
      log('sync.inventory.locations', { count: (shopifyLocations || []).length });

      const LOC_MAP = {
        'lakewood': 'LKW', 'flagship': 'LKW',
        'flatbush': 'FLT', 'avej': 'FLT', 'ave j': 'FLT', 'avenue j': 'FLT',
        'crown heights': 'CRH',
        'monsey': 'MNS',
        'online': 'ONL',
        'reserve': 'WH', 'warehouse': 'WH', 'main warehouse': 'WH',
        'studio': 'WH',  // Studio (internal) → warehouse
      };
      function resolveLocationCode(name) {
        const lower = (name || '').toLowerCase();
        for (const [key, code] of Object.entries(LOC_MAP)) {
          if (lower.includes(key)) return code;
        }
        return null;
      }

      for (const loc of (shopifyLocations || [])) {
        const locCode = resolveLocationCode(loc.name);
        if (!locCode) { log('sync.inventory.unknown_location', { name: loc.name, id: loc.id }); continue; }

        // Update locations table with Shopify ID
        try {
          await sql`UPDATE locations SET shopify_location_id = ${loc.id} WHERE code = ${locCode} AND shopify_location_id IS NULL`;
        } catch { /* ignore */ }

        const { inventory_levels: levels } = await client.getInventoryLevels(loc.id);
        for (const level of (levels || [])) {
          if (!level.inventory_item_id) continue;
          const shopifyQty = level.available || 0;

          // Resolve inventory_item_id → sku_id
          let skuId = null;
          try {
            const [skuRow] = await sql`SELECT id FROM skus WHERE shopify_inventory_item_id = ${level.inventory_item_id} LIMIT 1`;
            if (skuRow) skuId = skuRow.id;
          } catch { /* skus table may not exist */ }
          if (!skuId) continue;

          try {
            // Check current state: do events exist for this SKU+location?
            const [current] = await sql`SELECT COALESCE(SUM(quantity), 0)::int AS on_hand, COUNT(*)::int AS event_count FROM inventory_events WHERE sku_id = ${skuId} AND location_code = ${locCode}`;

            if (current.event_count === 0) {
              // SEED: first time — insert initial_seed event
              if (shopifyQty !== 0) {
                await sql`
                  INSERT INTO inventory_events (sku_id, location_code, event_type, quantity, reference_type, reference_id, created_by)
                  VALUES (${skuId}, ${locCode}, 'initial_seed', ${shopifyQty}, 'shopify_sync', ${String(level.inventory_item_id)}, 'sync')
                `;
                invSeeded++;
              }
            } else {
              // RECONCILE: events exist — check if our total matches Shopify
              const delta = shopifyQty - current.on_hand;
              if (delta === 0) {
                invOk++; // perfect match
              } else {
                // Drift detected — insert correction event
                await sql`
                  INSERT INTO inventory_events (sku_id, location_code, event_type, quantity, reference_type, reference_id, notes, created_by)
                  VALUES (${skuId}, ${locCode}, 'reconciliation', ${delta}, 'shopify_sync', ${String(level.inventory_item_id)},
                    ${'Shopify=' + shopifyQty + ' ERP=' + current.on_hand + ' delta=' + delta}, 'sync')
                `;
                invReconciled++;
              }
            }
          } catch (e) {
            if (invSeeded === 0 && invReconciled === 0 && e.message.includes('does not exist')) {
              log('sync.inventory.table_missing');
              break;
            }
          }
        }

        if ((invSeeded + invReconciled) % 200 === 0 && (invSeeded + invReconciled) > 0) {
          await setStatus(sql, { status: 'running', step: 'inventory_reconciliation', progress: `${invSeeded} seeded, ${invReconciled} reconciled, ${locCode}` });
        }
      }
    } catch (e) {
      log('sync.inventory.error', { error: e.message.slice(0, 80) });
    }
    results.inventorySeeded = invSeeded;
    results.inventoryReconciled = invReconciled;
    results.inventoryOk = invOk;
    log('sync.inventory.done', { seeded: invSeeded, reconciled: invReconciled, ok: invOk });

    // Alert if reconciliation found significant drift
    if (invReconciled > 0) {
      const total = invSeeded + invReconciled + invOk;
      const driftPct = total > 0 ? Math.round((invReconciled / total) * 100) : 0;
      if (driftPct > 2) {
        try {
          await sql`INSERT INTO alerts (type, severity, title, message)
            VALUES ('inventory_drift', ${driftPct > 10 ? 'critical' : 'warning'},
              ${'Inventory drift: ' + invReconciled + ' SKU×locations corrected (' + driftPct + '%)'},
              ${'Daily sync found ' + invReconciled + ' discrepancies between Shopify and ERP inventory. ' + invOk + ' matched. Check webhook reliability.'})`;
        } catch { /* alerts table may not exist */ }
      }
    }

    // ── Step 5: Fetch orders (30 days) ──────────────────
    await setStatus(sql, { status: 'running', step: 'fetching_orders' });
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

        // Resolve variant_id to sku_id (if skus table exists)
        let skuId = null;
        if (li.variant_id) {
          try {
            const [skuRow] = await sql`SELECT id FROM skus WHERE shopify_variant_id = ${li.variant_id} LIMIT 1`;
            if (skuRow) skuId = skuRow.id;
          } catch { /* skus table may not exist */ }
        }

        try {
          // Try with sku_id if we have one (requires migration 012)
          if (skuId) {
            try {
              await sql`
                INSERT INTO sales (order_id, order_shopify_id, ordered_at, store, mp_id, sku, title, quantity, unit_price, total, customer_name, sku_id)
                VALUES (${order.name || String(order.id)}, ${order.id}, ${order.created_at}, ${channel}, ${mpId},
                  ${li.sku || null}, ${li.title || null}, ${li.quantity || 1},
                  ${parseFloat(li.price) || 0}, ${(parseFloat(li.price) || 0) * (li.quantity || 1)},
                  ${order.customer?.first_name ? `${order.customer.first_name} ${order.customer.last_name || ''}`.trim() : null},
                  ${skuId})
                ON CONFLICT DO NOTHING
              `;
              salesStored++;
              continue;
            } catch (e2) {
              if (!e2.message?.includes('sku_id')) throw e2; // re-throw if not column-missing
              // Fall through to insert without sku_id
            }
          }
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
      if (!getStore) throw new Error('Blobs not available');
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
