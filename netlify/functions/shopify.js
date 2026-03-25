// netlify/functions/shopify.js
// ═══════════════════════════════════════════════════════════════
// Stallon: Shopify API gateway — all /api/shopify/* routes
// Now backed by lib/shopify/ TypeScript library (compiled by esbuild)
// ═══════════════════════════════════════════════════════════════

const { createClient }           = require('../../lib/shopify');
const { json, cors, authenticate } = require('../../lib/auth');
const {
  mapProduct, mapOrder, mapLedgerEntry, mapSnapshotProduct, mapSKU,
  buildProductTree,
} = require('../../lib/mappers');
const { sinceDate, buildVelocity, buildSalesSummary } = require('../../lib/analytics');
const { normalizeLocation, buildStoreInventory }      = require('../../lib/shopify/locations');

// ── In-memory cache (persists within lambda container ~5-15 min) ──
const _cache = {};
const CACHE_TTL = {
  status:    30,
  products:  300,
  inventory: 120,
  orders:    60,
  velocity:  180,
  sales:     120,
  titles:    300,
  'sku-map': 300,
};
function cacheGet(key)          { const e=_cache[key]; if(!e)return null; if(Date.now()>e.expires){delete _cache[key];return null;} return e.data; }
function cacheSet(key,data,ttl) { _cache[key]={data,expires:Date.now()+(ttl||60)*1000}; }
function cacheKey(p,q)          { return `${p}:${q?JSON.stringify(q):''}`; }
class RouteError extends Error  { constructor(s,m){super(m);this.status=s;} }

// ── Route handlers ───────────────────────────────────────────

async function status() {
  const ck = cacheKey('status');
  const cached = cacheGet(ck);
  if (cached) return cached;
  const client = await createClient();
  if (!client) return { connected:false, message:'Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' };
  try {
    const shop = await client.getShop();
    const result = { connected:true, shop:shop.name, domain:shop.domain, plan:shop.plan_name, currency:shop.currency };
    cacheSet(ck, result, CACHE_TTL.status);
    return result;
  } catch(err) {
    return { connected:false, message:err.message };
  }
}

async function syncProducts(client) {
  const ck = cacheKey('products');
  const cached = cacheGet(ck);
  if (cached) return { ...cached, _cached:true };
  const products = await client.getProducts();
  const result = { count:products.length, products:products.map(mapProduct), synced:true };
  cacheSet(ck, result, CACHE_TTL.products);
  return result;
}

async function syncOrders(client, { body, params }) {
  const since = (body && body.since) || params.since;
  const ck = cacheKey('orders', { since });
  const cached = cacheGet(ck);
  if (cached) return { ...cached, _cached:true };
  const opts = since ? { created_at_min:since } : {};
  const orders = await client.getOrders(opts);
  const result = { count:orders.length, orders:orders.map(mapOrder) };
  cacheSet(ck, result, CACHE_TTL.orders);
  return result;
}

async function syncInventory(client) {
  const ck = cacheKey('inventory');
  const cached = cacheGet(ck);
  if (cached) return { ...cached, _cached:true };
  const locations = await client.getLocations();
  const result = [];
  for (const loc of locations) {
    const levels = await client.getInventoryLevels(loc.id);
    result.push({
      locationId:   loc.id,
      locationName: normalizeLocation(loc.name),
      levels: levels.map(l => ({ inventoryItemId:l.inventory_item_id, available:l.available, updatedAt:l.updated_at })),
    });
  }
  const byStore = buildStoreInventory(result);
  const data = { locations:result, byStore };
  cacheSet(ck, data, CACHE_TTL.inventory);
  return data;
}

async function velocity(client, { params }) {
  const days = parseInt(params.days||'30',10);
  const ck = cacheKey('velocity',{days});
  const cached = cacheGet(ck);
  if (cached) return cached;
  const orders = await client.getOrders({ created_at_min:sinceDate(days) });
  const result = { days, orderCount:orders.length, velocity:buildVelocity(orders, days) };
  cacheSet(ck, result, CACHE_TTL.velocity);
  return result;
}

async function sales(client, { params }) {
  const days = parseInt(params.days||'30',10);
  const ck = cacheKey('sales',{days});
  const cached = cacheGet(ck);
  if (cached) return cached;
  const orders = await client.getOrders({ created_at_min:sinceDate(days) });
  const result = buildSalesSummary(orders, days);
  cacheSet(ck, result, CACHE_TTL.sales);
  return result;
}

async function ledger(client, { params }) {
  const days = parseInt(params.days||'30',10);
  const orders = await client.getOrders({ created_at_min:sinceDate(days) });
  return { days, entries:orders.length, ledger:orders.map(mapLedgerEntry) };
}

async function takeSnapshot(client) {
  const products = await client.getProducts();
  return { timestamp:new Date().toISOString(), products:products.map(mapSnapshotProduct) };
}

async function listSnapshots() { return { snapshots:[] }; }

async function skuMap(client, { params }) {
  const ck = cacheKey('sku-map',{filter:params.filter});
  const cached = cacheGet(ck);
  if (cached) return cached;
  const products = await client.getProducts();
  const map = products.flatMap(p => p.variants.map(v => mapSKU(p, v)));
  const f = params.filter;
  const filtered = f && f!=='all' ? map.filter(s=>s.sku.toLowerCase().includes(f.toLowerCase())) : map;
  const result = { count:filtered.length, skuMap:filtered };
  cacheSet(ck, result, CACHE_TTL['sku-map']);
  return result;
}

async function updateSKU(_client, { pathParams, body }) {
  return { sku:decodeURIComponent(pathParams.sku), ...body, updated:true };
}

async function confirmAllSKU() { return { confirmed:true, message:'All SKU mappings confirmed' }; }

async function webhooksSetup(client, { body }) {
  if (!body.base_url) throw new RouteError(400,'base_url required');
  const topics = ['orders/create','orders/updated','products/update','inventory_levels/update'];
  const existing = await client.getWebhooks();
  for (const wh of existing) await client.deleteWebhook(wh.id);
  const created = [];
  for (const topic of topics) {
    const address = `${body.base_url}/api/webhooks/shopify`;
    const webhook = await client.createWebhook(topic, address);
    created.push({ topic, address, id:webhook.id });
  }
  return { message:'Webhooks configured', webhooks:created };
}

async function draftOrders(client, { params }) {
  const status = params.status || 'open';
  let all = [];
  try {
    all = await client.fetchAll('/draft_orders.json','draft_orders',{ status, limit:'250' });
  } catch(e) { all = []; }
  return {
    count: all.length,
    draftOrders: all.map(d => ({
      id:d.id, name:d.name, status:d.status,
      createdAt:d.created_at, updatedAt:d.updated_at,
      lineItems:(d.line_items||[]).map(li=>({ title:li.title, sku:li.sku, quantity:li.quantity, price:li.price, vendor:li.vendor })),
      totalPrice:d.total_price, note:d.note, tags:d.tags,
    })),
  };
}

async function inventoryAdjust(client, { body }) {
  const { inventoryItemId, locationId, adjustment } = body;
  if (!inventoryItemId||!locationId||adjustment===undefined) throw new RouteError(400,'inventoryItemId, locationId, and adjustment required');
  const result = await client.adjustInventory(inventoryItemId, locationId, adjustment);
  return { adjusted:true, inventoryLevel:result.inventory_level };
}

async function listTitles(client) {
  const ck = cacheKey('titles');
  const cached = cacheGet(ck);
  if (cached) return cached;
  const products = await client.getProducts();
  const result = {
    count: products.length,
    titles: products.map(p => ({
      title:p.title, productType:p.product_type||p.productType, status:p.status,
      variants:p.variants.length, price:p.variants[0]?.price||'0',
    })).sort((a,b)=>a.title.localeCompare(b.title)),
  };
  cacheSet(ck, result, CACHE_TTL.titles);
  return result;
}

// ── NEW: Product tree endpoint — returns MP→Style→Fit→Size hierarchy ──
async function productTrees(client, { params }) {
  const ck = cacheKey('product-trees');
  const cached = cacheGet(ck);
  if (cached) return cached;
  const products = await client.getProducts();
  const trees = products.map(buildProductTree);
  const result = { count:trees.length, trees };
  cacheSet(ck, result, CACHE_TTL.products);
  return result;
}

// ── Cache management ─────────────────────────────────────────
async function cacheStats() {
  const entries = Object.entries(_cache);
  return {
    entries: entries.length,
    alive:   entries.filter(([,e])=>Date.now()<e.expires).length,
    stats:   entries.map(([k,e])=>({ key:k.split(':')[0], expiresIn:Math.round((e.expires-Date.now())/1000), alive:Date.now()<e.expires })),
  };
}
async function cacheClear() {
  const count = Object.keys(_cache).length;
  for (const k of Object.keys(_cache)) delete _cache[k];
  return { cleared:count };
}

// ── Route table ──────────────────────────────────────────────
const ROUTES = [
  { method:'GET',  path:'status',              handler:status,         noClient:true },
  { method:'POST', path:'connect',             handler:()=>({ message:'Set env vars in Netlify dashboard' }), noClient:true },
  { method:'POST', path:'disconnect',          handler:()=>({ message:'Remove SHOPIFY_ACCESS_TOKEN to disconnect' }), noClient:true },
  { method:'POST', path:'sync/products',       handler:syncProducts },
  { method:'POST', path:'sync/orders',         handler:syncOrders },
  { method:'POST', path:'sync/inventory',      handler:syncInventory },
  { method:'GET',  path:'velocity',            handler:velocity },
  { method:'GET',  path:'sales',               handler:sales },
  { method:'GET',  path:'ledger',              handler:ledger },
  { method:'POST', path:'snapshot',            handler:takeSnapshot },
  { method:'GET',  path:'snapshots',           handler:listSnapshots,  noClient:true },
  { method:'GET',  path:'sku-map',             handler:skuMap },
  { method:'PATCH',path:'sku-map/:sku',        handler:updateSKU,      noClient:true },
  { method:'POST', path:'sku-map/confirm-all', handler:confirmAllSKU,  noClient:true },
  { method:'POST', path:'webhooks/setup',      handler:webhooksSetup },
  { method:'GET',  path:'titles',              handler:listTitles },
  { method:'GET',  path:'product-trees',       handler:productTrees },
  { method:'GET',  path:'draft-orders',        handler:draftOrders },
  { method:'POST', path:'inventory/adjust',    handler:inventoryAdjust },
  { method:'GET',  path:'cache/stats',         handler:cacheStats,     noClient:true },
  { method:'POST', path:'cache/clear',         handler:cacheClear,     noClient:true },
];

function matchRoute(method, path) {
  for (const route of ROUTES) {
    if (route.method!==method) continue;
    const rp=route.path.split('/'), pp=path.split('/');
    if (rp.length!==pp.length) continue;
    const pathParams={};
    const match=rp.every((s,i)=>{ if(s.startsWith(':')){pathParams[s.slice(1)]=pp[i];return true;} return s===pp[i]; });
    if (match) return { route, pathParams };
  }
  return null;
}

// ── Entry point ──────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod==='OPTIONS') return { statusCode:204, headers:cors() };
  const auth = authenticate(event);
  if (!auth.ok) return json(401, { error:auth.error });

  let rawPath = (event.path||'')
    .replace(/^\/api\/shopify\/?/,'')
    .replace(/^\/.netlify\/functions\/shopify\/?/,'')
    .replace(/\/$/,'');
  const path = rawPath||'status';

  const matched = matchRoute(event.httpMethod, path);
  if (!matched) return json(404, { error:`No route: ${event.httpMethod} /${path}` });
  const { route, pathParams } = matched;

  try {
    const client = route.noClient ? null : await createClient();
    if (!route.noClient && !client) return json(503, { error:'Shopify not configured — set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' });
    const ctx = {
      params:     event.queryStringParameters||{},
      body:       event.body ? JSON.parse(event.body) : {},
      pathParams,
    };
    const result = await route.handler(client, ctx);
    const headers = {};
    if (event.httpMethod==='GET' && result && !result.error) {
      const crypto=require('crypto');
      const etag='"'+crypto.createHash('md5').update(JSON.stringify(result)).digest('hex').slice(0,12)+'"';
      headers['ETag']=etag;
      if (event.headers['if-none-match']===etag) return { statusCode:304, headers:{...cors(),...headers} };
    }
    return json(200, result, headers);
  } catch(err) {
    if (err instanceof RouteError) return json(err.status, { error:err.message });
    console.error(`[shopify] ${event.httpMethod} ${path}:`, err);
    return json(500, { error:err.message });
  }
};
