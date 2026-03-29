/**
 * /api/webhooks/shopify — Shopify webhook receiver
 * Owner: Bonney (Data Pipeline)
 *
 * Receives real-time events from Shopify:
 *   orders/create     → match to MPs, deduct inventory, emit SALE_RECORDED
 *   products/update   → update MP hero_image + external_ids
 *   products/create   → same as update
 *   inventory_levels/update → logged for next sync reconciliation
 *
 * Deduplication: inserts into webhook_events table first. If
 * X-Shopify-Event-Id already exists, returns 200 and skips processing.
 */

const crypto = require('crypto');
const { json, cors } = require('../../lib/auth');
const { neon } = require('@netlify/neon');

function verify(rawBody, hmac) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true; // allow in dev
  if (!hmac) return false;
  try {
    const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch { return false; }
}

function log(event, data = {}) {
  console.log(JSON.stringify({ event, ...data, ts: new Date().toISOString() }));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  // ── HMAC verification ─────────────────────────────────
  try {
    if (!verify(event.body, event.headers['x-shopify-hmac-sha256'])) {
      log('webhook.hmac_failed');
      return json(401, { error: 'Bad signature' });
    }
  } catch {
    return json(401, { error: 'Bad signature' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const topic = event.headers['x-shopify-topic'] || 'unknown';
  const eventId = event.headers['x-shopify-event-id'] || null;
  log('webhook.received', { topic, eventId, shopifyId: payload.id || payload.inventory_item_id });

  const sql = neon();

  // ── Deduplication ─────────────────────────────────────
  // Insert into webhook_events. If eventId already exists, skip processing.
  if (eventId) {
    try {
      await sql`
        INSERT INTO webhook_events (source, topic, external_id, payload, status)
        VALUES ('shopify', ${topic}, ${eventId}, ${JSON.stringify(payload)}::jsonb, 'processing')
      `;
    } catch (e) {
      // 23505 = unique_violation → duplicate webhook
      if (e.code === '23505' || (e.message && e.message.includes('unique'))) {
        log('webhook.duplicate_skipped', { topic, eventId });
        return json(200, { received: true, topic, deduplicated: true });
      }
      // Table might not exist yet — continue processing
      log('webhook.dedup_skip', { reason: e.message.slice(0, 60) });
    }
  }

  // ── Process by topic ──────────────────────────────────
  const { matchProduct } = require('../../lib/products');
  const result = { received: true, topic };

  try {
    if (topic === 'orders/create') {
      const items = [];
      for (const li of (payload.line_items || [])) {
        const mpId = li.title ? matchProduct(li.title) : null;
        if (mpId) {
          items.push({ mpId, sku: li.sku, qty: li.quantity, price: parseFloat(li.price || 0) });
          // Deduct inventory
          try {
            await sql`UPDATE master_products SET total_inventory = GREATEST(0, total_inventory - ${li.quantity}) WHERE id = ${mpId}`;
          } catch (e) { log('webhook.inventory_deduct_err', { mpId, error: e.message.slice(0, 40) }); }
        }
      }

      // Store sales
      const channel = payload.source_name === 'pos' ? 'POS' : 'Online';
      for (const li of (payload.line_items || [])) {
        const mpId = li.title ? matchProduct(li.title) : null;
        try {
          await sql`
            INSERT INTO sales (order_id, order_shopify_id, ordered_at, store, mp_id, sku, title, quantity, unit_price, total, customer_name)
            VALUES (${payload.name || String(payload.id)}, ${payload.id}, ${payload.created_at}, ${channel}, ${mpId},
              ${li.sku || null}, ${li.title || null}, ${li.quantity || 1},
              ${parseFloat(li.price) || 0}, ${(parseFloat(li.price) || 0) * (li.quantity || 1)},
              ${payload.customer?.first_name ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim() : null})
            ON CONFLICT DO NOTHING
          `;
        } catch (e) { /* sales table may not exist */ }
      }

      result.order = { name: payload.name, total: payload.total_price, items: items.length };
      log('webhook.order_processed', { name: payload.name, items: items.length });
    }

    if (topic === 'products/update' || topic === 'products/create') {
      const maxPrice = Math.max(...(payload.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = matchProduct(payload.title, maxPrice);
      if (mpId) {
        const totalInv = (payload.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
        try {
          await sql`UPDATE master_products SET hero_image = COALESCE(${payload.image?.src || null}, hero_image), total_inventory = ${totalInv} WHERE id = ${mpId}`;
        } catch (e) { log('webhook.product_update_err', { mpId, error: e.message.slice(0, 40) }); }
        result.product = { mpId, image: !!payload.image?.src, inventory: totalInv };
        log('webhook.product_processed', { mpId, title: payload.title });
      }
    }

    if (topic === 'inventory_levels/update') {
      result.inventory = { itemId: payload.inventory_item_id, locationId: payload.location_id, available: payload.available };
      log('webhook.inventory_noted', { itemId: payload.inventory_item_id, available: payload.available });
    }

    // Mark webhook as processed
    if (eventId) {
      try {
        await sql`UPDATE webhook_events SET status = 'processed', processed_at = NOW() WHERE external_id = ${eventId} AND source = 'shopify'`;
      } catch (e) { /* table may not exist */ }
    }

  } catch (e) {
    log('webhook.processing_error', { topic, error: e.message });
    // Mark webhook as failed
    if (eventId) {
      try {
        await sql`UPDATE webhook_events SET status = 'failed', error_message = ${e.message.slice(0, 200)} WHERE external_id = ${eventId} AND source = 'shopify'`;
      } catch { /* ignore */ }
    }
    result.error = e.message;
  }

  return json(200, result);
};
