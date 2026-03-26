/**
 * /api/status/* — Connection status, cache management, webhooks
 * Owner: Stallon (API layer)
 * 
 * Routes:
 *   GET  /api/status           → Shopify connection status
 *   GET  /api/status/cache     → cache stats
 *   POST /api/status/cache/clear → clear cache
 *   POST /api/status/webhooks  → setup webhooks
 */

const { createHandler, RouteError } = require('../../lib/handler');
const cache = require('../../lib/cache');
const store = require('../../lib/store');

// ── Handlers ────────────────────────────────────────────────

async function connectionStatus() {
  const { createClient } = require('../../lib/shopify');
  const ck = cache.makeKey('status', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const client = await createClient();
  if (!client) return { connected: false, message: 'Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' };

  try {
    const { shop } = await client._request('/shop.json');
    const result = {
      connected: true,
      shop: shop.name,
      domain: shop.domain,
      plan: shop.plan_name,
      currency: shop.currency,
      apiVersion: client.version,
      storeUrl: client.shop,
    };
    cache.set(ck, result, cache.CACHE_TTL.status);
    return result;
  } catch (err) {
    return {
      connected: false,
      message: err.message,
      apiVersion: client.version,
      storeUrl: client.shop,
      baseUrl: client.base,
      hint: err.message.includes('404') ? 'API version may be expired. Try setting SHOPIFY_API_VERSION env var to 2025-01, 2025-04, or 2025-07' : null,
    };
  }
}

async function cacheStats() {
  return cache.stats();
}

async function cacheClear() {
  return cache.clear();
}

async function webhooksSetup(client, { body }) {
  if (!body.base_url) throw new RouteError(400, 'base_url required');
  const topics = ['orders/create', 'orders/updated', 'products/update', 'inventory_levels/update'];
  const { webhooks: existing } = await client.getWebhooks();
  for (const wh of existing) await client.deleteWebhook(wh.id);
  const created = [];
  for (const topic of topics) {
    const address = `${body.base_url}/api/webhooks/shopify`;
    const { webhook } = await client.createWebhook(topic, address);
    created.push({ topic, address, id: webhook.id });
  }
  return { message: 'Webhooks configured', webhooks: created };
}

// ── Database Status ──────────────────────────────────────

async function dbStatus() {
  return store.backend();
}

async function dbMigrate() {
  try {
    return await store.migrate();
  } catch (err) {
    throw new RouteError(500, `Migration failed: ${err.message}`);
  }
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',  path: '',            handler: connectionStatus, noClient: true },
  { method: 'GET',  path: 'cache',       handler: cacheStats,       noClient: true },
  { method: 'POST', path: 'cache/clear', handler: cacheClear,       noClient: true },
  { method: 'GET',  path: 'db',          handler: dbStatus,         noClient: true },
  { method: 'POST', path: 'db/migrate',  handler: dbMigrate,        noClient: true },
  { method: 'POST', path: 'webhooks',    handler: webhooksSetup },
];

exports.handler = createHandler(ROUTES, 'status');
