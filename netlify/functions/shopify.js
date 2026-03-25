const { createClient } = require('../../lib/shopify');
const { json, cors, authenticate } = require('../../lib/auth');
const { mapProduct, mapOrder, mapLedgerEntry, mapSnapshotProduct, mapSKU } = require('../../lib/mappers');
const { sinceDate, buildVelocity, buildSalesSummary } = require('../../lib/analytics');

// ═══════════════════════════════════════════════════════════════
// Stallon: In-memory cache — persists within lambda container
// Netlify reuses containers for ~5-15 min between cold starts.
// This prevents hammering Shopify on rapid page navigations.
// ═══════════════════════════════════════════════════════════════
const _cache = {};
const CACHE_TTL = {
  status:     30,   // 30s  — connection check
  products:   300,  // 5min — products rarely change
  inventory:  120,  // 2min — inventory changes often
  orders:     60,   // 1min — orders flow in
  velocity:   180,  // 3min — aggregated, stable
  sales:      120,  // 2min — sales summary
  titles:     300,  // 5min — just titles
  'sku-map':  300,  // 5min — SKU list
};

function cacheGet(key) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expires) { delete _cache[key]; return null; }
  return entry.data;
}

function cacheSet(key, data, ttlSec) {
  _cache[key] = { data, expires: Date.now() + (ttlSec || 60) * 1000 };
}

function cacheKey(path, params) {
  const ps = params ? JSON.stringify(params) : '';
  return `${path}:${ps}`;
}

class RouteError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ── Route handlers ──────────────────────────────────────────

async function status() {
  const ck = cacheKey('status');
  const cached = cacheGet(ck);
  if (cached) return cached;

  const client = await createClient();
  if (!client) return { connected: false, message: 'Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' };
  try {
    const { shop } = await client._request('/shop.json');
    const result = { connected: true, shop: shop.name, domain: shop.domain, plan: shop.plan_name, currency: shop.currency };
    cacheSet(ck, result, CACHE_TTL.status);
    return result;
  } catch (err) {
    return { connected: false, message: err.message };
  }
}

async function syncProducts(client) {
  const ck = cacheKey('products');
  const cached = cacheGet(ck);
  if (cached) return { ...cached, _cached: true };

  const { products } = await client.getProducts();
  const result = { count: products.length, products: products.map(mapProduct) };
  cacheSet(ck, result, CACHE_TTL.products);
  return result;
}

async function syncOrders(client, { body, params }) {
  const since = body.since || params.since;
  const ck = cacheKey('orders', { since });
  const cached = cacheGet(ck);
  if (cached) return { ...cached, _cached: true };

  const opts = since ? { created_at_min: since } : {};
  const { orders } = await client.getOrders(opts);
  const result = { count: orders.length, orders: orders.map(mapOrder) };
  cacheSet(ck, result, CACHE_TTL.orders);
  return result;
}

async function syncInventory(client) {
  const ck = cacheKey('inventory');
  const cached = cacheGet(ck);
  if (cached) return { ...cached, _cached: true };

  const { locations } = await client.getLocations();
  const result = [];
  for (const loc of locations) {
    const { inventory_levels } = await client.getInventoryLevels(loc.id);
    result.push({
      locationId:   loc.id,
      locationName: loc.name,
      levels: inventory_levels.map(l => ({
        inventoryItemId: l.inventory_item_id,
        available:       l.available,
        updatedAt:       l.updated_at,
      })),
    });
  }
  const data = { locations: result };
  cacheSet(ck, data, CACHE_TTL.inventory);
  return data;
}

async function velocity(client, { params }) {
  const days = parseInt(params.days || '30', 10);
  const ck = cacheKey('velocity', { days });
  const cached = cacheGet(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const result = { days, orderCount: orders.length, velocity: buildVelocity(orders, days) };
  cacheSet(ck, result, CACHE_TTL.velocity);
  return result;
}

async function sales(client, { params }) {
  const days = parseInt(params.days || '30', 10);
  const ck = cacheKey('sales', { days });
  const cached = cacheGet(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const result = buildSalesSummary(orders, days);
  cacheSet(ck, result, CACHE_TTL.sales);
  return result;
}

async function ledger(client, { params }) {
  const days = parseInt(params.days || '30', 10);
  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const entries = orders.map(mapLedgerEntry);
  return { days, entries: entries.length, ledger: entries };
}

async function takeSnapshot(client) {
  const { products } = await client.getProducts();
  return { timestamp: new Date().toISOString(), products: products.map(mapSnapshotProduct) };
}

async function listSnapshots() {
  return { snapshots: [] };
}

async function skuMap(client, { params }) {
  const ck = cacheKey('sku-map', { filter: params.filter });
  const cached = cacheGet(ck);
  if (cached) return cached;

  const { products } = await client.getProducts();
  const map = products.flatMap(p => p.variants.map(v => mapSKU(p, v)));
  const filter = params.filter;
  const filtered = filter && filter !== 'all' ? map.filter(s => s.sku.toLowerCase().includes(filter.toLowerCase())) : map;
  const result = { count: filtered.length, skuMap: filtered };
  cacheSet(ck, result, CACHE_TTL['sku-map']);
  return result;
}

async function updateSKU(client, { pathParams, body }) {
  const sku = decodeURIComponent(pathParams.sku);
  return { sku, ...body, updated: true };
}

async function confirmAllSKU() {
  return { confirmed: true, message: 'All SKU mappings confirmed' };
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

async function listTitles(client) {
  const ck = cacheKey('titles');
  const cached = cacheGet(ck);
  if (cached) return cached;

  const { products } = await client.getProducts();
  const result = {
    count: products.length,
    titles: products.map(p => ({
      title: p.title,
      productType: p.productType,
      status: p.status,
      variants: p.variants.length,
      price: p.variants[0]?.price || '0',
    })).sort((a,b) => a.title.localeCompare(b.title))
  };
  cacheSet(ck, result, CACHE_TTL.titles);
  return result;
}

// ── Cache management endpoint ─────────────────────────────────
async function cacheStats() {
  const entries = Object.entries(_cache);
  const stats = entries.map(([key, entry]) => ({
    key: key.split(':')[0],
    expiresIn: Math.round((entry.expires - Date.now()) / 1000),
    alive: Date.now() < entry.expires,
  }));
  return { entries: stats.length, alive: stats.filter(s => s.alive).length, stats };
}

async function cacheClear() {
  const count = Object.keys(_cache).length;
  for (const k of Object.keys(_cache)) delete _cache[k];
  return { cleared: count };
}

// ── Route table ─────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: 'status',              handler: status,         noClient: true },
  { method: 'POST',  path: 'connect',             handler: () => ({ message: 'Set env vars in Netlify dashboard' }), noClient: true },
  { method: 'POST',  path: 'disconnect',          handler: () => ({ message: 'Remove SHOPIFY_ACCESS_TOKEN to disconnect' }), noClient: true },
  { method: 'POST',  path: 'sync/products',       handler: syncProducts },
  { method: 'POST',  path: 'sync/orders',         handler: syncOrders },
  { method: 'POST',  path: 'sync/inventory',      handler: syncInventory },
  { method: 'GET',   path: 'velocity',            handler: velocity },
  { method: 'GET',   path: 'sales',               handler: sales },
  { method: 'GET',   path: 'ledger',              handler: ledger },
  { method: 'POST',  path: 'snapshot',            handler: takeSnapshot },
  { method: 'GET',   path: 'snapshots',           handler: listSnapshots,  noClient: true },
  { method: 'GET',   path: 'sku-map',             handler: skuMap },
  { method: 'PATCH', path: 'sku-map/:sku',        handler: updateSKU,      noClient: true },
  { method: 'POST',  path: 'sku-map/confirm-all', handler: confirmAllSKU,  noClient: true },
  { method: 'POST',  path: 'webhooks/setup',      handler: webhooksSetup },
  { method: 'GET',   path: 'titles',              handler: listTitles },
  { method: 'GET',   path: 'cache/stats',         handler: cacheStats,     noClient: true },
  { method: 'POST',  path: 'cache/clear',         handler: cacheClear,     noClient: true },
];

function matchRoute(method, path) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const routeParts = route.path.split('/');
    const pathParts  = path.split('/');
    if (routeParts.length !== pathParts.length) continue;
    const pathParams = {};
    const match = routeParts.every((seg, i) => {
      if (seg.startsWith(':')) { pathParams[seg.slice(1)] = pathParts[i]; return true; }
      return seg === pathParts[i];
    });
    if (match) return { route, pathParams };
  }
  return null;
}

// ── Entry point ─────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };

  const auth = authenticate(event);
  if (!auth.ok) return json(401, { error: auth.error });

  let rawPath = event.path || '';
  rawPath = rawPath
    .replace(/^\/api\/shopify\/?/, '')
    .replace(/^\/.netlify\/functions\/shopify\/?/, '')
    .replace(/\/$/, '');
  const path = rawPath || 'status';

  const matched = matchRoute(event.httpMethod, path);
  if (!matched) return json(404, { error: `No route: ${event.httpMethod} /${path}` });

  const { route, pathParams } = matched;

  try {
    const client = route.noClient ? null : await createClient();
    if (!route.noClient && !client) return json(503, { error: 'Shopify not configured — set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' });

    const ctx = {
      params:     event.queryStringParameters || {},
      body:       event.body ? JSON.parse(event.body) : {},
      pathParams,
    };

    const result = await route.handler(client, ctx);

    // Add ETag for cacheable GET responses
    const headers = {};
    if (event.httpMethod === 'GET' && result && !result.error) {
      const crypto = require('crypto');
      const etag = '"' + crypto.createHash('md5').update(JSON.stringify(result)).digest('hex').slice(0, 12) + '"';
      headers['ETag'] = etag;

      // Check If-None-Match
      const clientEtag = event.headers['if-none-match'];
      if (clientEtag === etag) {
        return { statusCode: 304, headers: { ...cors(), ...headers } };
      }
    }

    return json(200, result, headers);

  } catch (err) {
    if (err instanceof RouteError) return json(err.status, { error: err.message });
    console.error(`[shopify] ${event.httpMethod} ${path}:`, err);
    return json(500, { error: err.message });
  }
};
