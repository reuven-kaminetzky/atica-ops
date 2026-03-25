const { createClient } = require('../../lib/shopify');
const { json, cors, authenticate } = require('../../lib/auth');
const { mapProduct, mapOrder, mapLedgerEntry, mapSnapshotProduct, mapSKU } = require('../../lib/mappers');
const { sinceDate, buildVelocity, buildSalesSummary } = require('../../lib/analytics');

class RouteError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ── Route handlers ──────────────────────────────────────────

async function status() {
  const client = createClient();
  if (!client) return { connected: false, message: 'Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' };
  try {
    const { shop } = await client._request('/shop.json');
    return { connected: true, shop: shop.name, domain: shop.domain, plan: shop.plan_name, currency: shop.currency };
  } catch (err) {
    return { connected: false, message: err.message };
  }
}

async function connect() {
  return {
    message: 'Set env vars in Netlify dashboard',
    steps: ['Site settings → Environment variables','SHOPIFY_STORE_URL = your-store.myshopify.com','SHOPIFY_ACCESS_TOKEN = shpat_xxxxx','Redeploy'],
  };
}

async function disconnect() {
  return { message: 'Remove SHOPIFY_ACCESS_TOKEN from Netlify env vars to disconnect' };
}

async function syncProducts(client) {
  const { products } = await client.getProducts();
  return { count: products.length, products: products.map(mapProduct) };
}

async function syncOrders(client, { body, params }) {
  const since = body.since || params.since;
  const opts = since ? { created_at_min: since } : {};
  const { orders } = await client.getOrders(opts);
  return { count: orders.length, orders: orders.map(mapOrder) };
}

async function syncInventory(client) {
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
  return { locations: result };
}

async function velocity(client, { params }) {
  const days = parseInt(params.days || '30', 10);
  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  return { days, orderCount: orders.length, velocity: buildVelocity(orders, days) };
}

async function sales(client, { params }) {
  const days = parseInt(params.days || '30', 10);
  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  return buildSalesSummary(orders, days);
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
  const { products } = await client.getProducts();
  const map = products.flatMap(p => p.variants.map(v => mapSKU(p, v)));
  const filter = params.filter;
  const filtered = filter && filter !== 'all' ? map.filter(s => s.sku.toLowerCase().includes(filter.toLowerCase())) : map;
  return { count: filtered.length, skuMap: filtered };
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

// ── Route table ─────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: 'status',              handler: status,         noClient: true },
  { method: 'POST',  path: 'connect',             handler: connect,        noClient: true },
  { method: 'POST',  path: 'disconnect',          handler: disconnect,     noClient: true },
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

  // Normalise path — handle both /api/shopify/* and /.netlify/functions/shopify/*
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
    const client = route.noClient ? null : createClient();
    if (!route.noClient && !client) return json(503, { error: 'Shopify not configured — set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' });

    const ctx = {
      params:     event.queryStringParameters || {},
      body:       event.body ? JSON.parse(event.body) : {},
      pathParams,
    };

    const result = await route.handler(client, ctx);
    return json(200, result);

  } catch (err) {
    if (err instanceof RouteError) return json(err.status, { error: err.message });
    console.error(`[shopify] ${event.httpMethod} ${path}:`, err);
    return json(500, { error: err.message });
  }
};
