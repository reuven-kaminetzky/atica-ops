const crypto = require('crypto');
const { json, cors } = require('../../lib/auth');

/**
 * Webhook receiver for Shopify events
 * Shopify sends POST requests here when orders/inventory/products change
 *
 * External apps can also subscribe by setting WEBHOOK_FORWARD_URL
 * to receive a copy of every event at their own endpoint.
 */

function verifyShopifyWebhook(body, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if no secret set
  const hash = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader || ''));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  // Verify webhook signature
  const hmac = event.headers['x-shopify-hmac-sha256'];
  try {
    if (!verifyShopifyWebhook(event.body, hmac)) {
      return json(401, { error: 'Invalid webhook signature' });
    }
  } catch {
    return json(401, { error: 'Invalid webhook signature' });
  }

  const topic = event.headers['x-shopify-topic'];
  const shopDomain = event.headers['x-shopify-shop-domain'];
  const payload = JSON.parse(event.body);

  console.log(`[Webhook] ${topic} from ${shopDomain}`);

  const webhookEvent = {
    topic,
    shopDomain,
    receivedAt: new Date().toISOString(),
    payload,
  };

  // ── Forward to external app if configured ─────────────
  if (process.env.WEBHOOK_FORWARD_URL) {
    try {
      await fetch(process.env.WEBHOOK_FORWARD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Atica-Topic': topic,
          'X-Atica-Source': 'shopify',
          ...(process.env.WEBHOOK_FORWARD_SECRET
            ? { 'X-Atica-Secret': process.env.WEBHOOK_FORWARD_SECRET }
            : {}),
        },
        body: JSON.stringify(webhookEvent),
      });
    } catch (err) {
      console.error('[Webhook] Forward failed:', err.message);
    }
  }

  // ── Process by topic ──────────────────────────────────
  switch (topic) {
    case 'orders/create':
      console.log(`[Webhook] New order ${payload.name} — $${payload.total_price}`);
      break;

    case 'orders/updated':
      console.log(`[Webhook] Order updated ${payload.name} — ${payload.financial_status}`);
      break;

    case 'products/update':
      console.log(`[Webhook] Product updated: ${payload.title}`);
      break;

    case 'inventory_levels/update':
      console.log(`[Webhook] Inventory changed: item ${payload.inventory_item_id} at location ${payload.location_id} → ${payload.available}`);
      break;

    default:
      console.log(`[Webhook] Unhandled topic: ${topic}`);
  }

  return json(200, { received: true, topic });
};
