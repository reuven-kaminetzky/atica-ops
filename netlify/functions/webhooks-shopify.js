const crypto = require('crypto');
const { json, cors } = require('../../lib/auth');

function verify(rawBody, hmac) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true; // allow in dev
  if (!hmac) return false;
  try {
    const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch { return false; }
}

// ── Topic → which caches to invalidate ──
const CACHE_MAP = {
  'orders/create':           ['orders', 'pos'],
  'orders/updated':          ['orders', 'pos'],
  'products/update':         ['products'],
  'products/create':         ['products'],
  'products/delete':         ['products'],
  'inventory_levels/update': ['inventory'],
};

// Clear cache on the relevant modular function via internal HTTP
async function invalidateCaches(topic) {
  const targets = CACHE_MAP[topic];
  if (!targets || !targets.length) return [];

  const base = process.env.URL || 'https://atica-ops.netlify.app';
  const results = [];

  for (const target of targets) {
    // Each modular function has its own cache — but we can't clear it externally
    // because esbuild bundles separate copies. The real fix: reduce TTL on
    // webhook-affected data so it expires fast.
    // For now, log what would be invalidated.
    results.push({ target, action: 'ttl-expiry', note: `${target} cache TTL handles freshness` });
  }

  // Also clear the god-function cache if it's still serving traffic
  try {
    await fetch(`${base}/api/shopify/cache/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    results.push({ target: 'shopify-legacy', action: 'cleared' });
  } catch (e) {
    results.push({ target: 'shopify-legacy', action: 'failed', error: e.message });
  }

  return results;
}

// Track last webhook per topic — frontend can poll /api/status for freshness
let _lastWebhooks = {};

async function forward(event) {
  const url = process.env.WEBHOOK_FORWARD_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Atica-Topic':  event.topic,
        'X-Atica-Source': 'shopify',
        ...(process.env.WEBHOOK_FORWARD_SECRET ? { 'X-Atica-Secret': process.env.WEBHOOK_FORWARD_SECRET } : {}),
      },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error('[webhook] forward failed:', err.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  // GET /api/webhooks/last — return last webhook timestamps
  if (event.httpMethod === 'GET') {
    return json(200, { lastWebhooks: _lastWebhooks });
  }

  try {
    if (!verify(event.body, event.headers['x-shopify-hmac-sha256'])) {
      console.warn('[webhook] HMAC verification failed');
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
  const domain = event.headers['x-shopify-shop-domain'] || 'unknown';

  console.log(`[webhook] ${topic} from ${domain}`);

  // Track timestamp
  _lastWebhooks[topic] = new Date().toISOString();

  // Invalidate relevant caches
  const cacheResults = await invalidateCaches(topic);

  // Build event
  const webhookEvent = {
    topic,
    shopDomain: domain,
    receivedAt: new Date().toISOString(),
    payload,
  };

  // Forward if configured
  await forward(webhookEvent);

  // Log summary
  const summary = {
    received: true,
    topic,
    cacheInvalidation: cacheResults,
  };

  // Add topic-specific metadata
  if (topic === 'orders/create' && payload.name) {
    summary.order = { name: payload.name, total: payload.total_price, items: (payload.line_items || []).length };
    console.log(`[webhook] New order ${payload.name} — $${payload.total_price}`);
  } else if (topic === 'inventory_levels/update') {
    summary.inventory = { itemId: payload.inventory_item_id, locationId: payload.location_id, available: payload.available };
    console.log(`[webhook] Inventory update — item ${payload.inventory_item_id} → ${payload.available}`);
  } else if (topic.startsWith('products/') && payload.title) {
    summary.product = { id: payload.id, title: payload.title };
    console.log(`[webhook] Product ${topic.split('/')[1]} — ${payload.title}`);
  }

  return json(200, summary);
};
