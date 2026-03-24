const { createClient } = require('../../lib/shopify');
const { json, cors, authenticate } = require('../../lib/auth');
const { mapProduct, mapOrder, mapLedgerEntry, mapSnapshotProduct, mapSKU } = require('../../lib/mappers');
const { sinceDate, buildVelocity, buildSalesSummary } = require('../../lib/analytics');

// ── Route handlers ──────────────────────────────────────────

async function status() {
  const client = createClient();
  if (!client) return { connected: false, message: 'Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' };
  const { shop } = await client._request('/shop.json');
  return { connected: true, shop: shop.name, domain: shop.domain, plan: shop.plan_name, currency: shop.currency };
}

async function connect() {
  return {
    message: 'Set env vars in Netlify dashboard',
    steps: [
      'Site settings → Environment variables',
      'SHOPIFY_STORE_URL = your-store.myshopify.com',
      'SHOPIFY_ACCESS_TOKEN = shpat_xxxxx',
      'Redeploy',
    ],
  };
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

async function snapshot(client) {
  const { products } = await client.getProducts();
  return { timestamp: new Date().toISOString(), products: products.map(mapSnapshotProduct) };
}

async function skuMap(client) {
  const { products } = await client.getProducts();
  const map = products.flatMap(p => p.variants.map(v => mapSKU(p, v)));
  return { count: map.length, skuMap: map };
}

async function webhooksSetup(client, { body }) {
  if (!body.base_url) return { _status: 400, error: 'base_url required' };

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

async function disconnect() {
  return { message: 'Remove SHOPIFY_ACCESS_TOKEN from Netlify env vars to disconnect' };
}

// ── Route table ─────────────────────────────────────────────

const ROUTES = {
  'GET  status':          { handler: status, noClient: true },
  'POST connect':         { handler: connect, noClient: true },
  'POST disconnect':      { handler: disconnect, noClient: true },
  'POST sync/products':   { handler: syncProducts },
  'POST sync/orders':     { handler: syncOrders },
  'POST sync/inventory':  { handler: syncInventory },
  'GET  velocity':        { handler: velocity },
  'GET  sales':           { handler: sales },
  'GET  ledger':          { handler: ledger },
  'POST snapshot':        { handler: snapshot },
  'GET  sku-map':         { handler: skuMap },
  'POST webhooks/setup':  { handler: webhooksSetup },
};

// ── Entry point ─────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };

  const auth = authenticate(event);
  if (!auth.ok) return json(401, { error: auth.error });

  const path = event.path.replace(/^\/api\/shopify\/?/, '').replace(/\/$/, '');
  const key = `${event.httpMethod} ${path || 'status'}`;
  const route = ROUTES[key];

  if (!route) return json(404, { error: `No route: ${key}` });

  try {
    const client = route.noClient ? null : createClient();
    if (!route.noClient && !client) return json(503, { error: 'Shopify not configured' });

    const ctx = {
      params: event.queryStringParameters || {},
      body:   event.body ? JSON.parse(event.body) : {},
    };

    const result = await route.handler(client, ctx);
    const status = result?._status || 200;
    if (result?._status) delete result._status;
    return json(status, result);

  } catch (err) {
    console.error(`[shopify] ${key}:`, err);
    return json(500, { error: err.message });
  }
};
