/**
 * /api/pos/* — Point of Sale data
 * Owner: Stallon (API layer), consumed by Deshawn (POS module)
 * 
 * POS-specific views of order data — resolved by LOCATION, not source.
 * Uses location_id on orders → fetches Shopify locations → normalizes
 * to our store names (Lakewood, Flatbush, Crown Heights, Monsey, Online).
 * 
 * Routes:
 *   GET /api/pos/today       → today's sales across all stores
 *   GET /api/pos/by-location → sales grouped by location (?days=7)
 *   GET /api/pos/feed        → recent transactions (?limit=50)
 */

const { createHandler } = require('../../lib/handler');
const { sinceDate } = require('../../lib/analytics');
const cache = require('../../lib/cache');

// ── Location resolution ─────────────────────────────────────
// Shopify locations have IDs. Orders have location_id.
// We fetch the location map once and cache it.

const STORE_NORMALIZE = {
  'lakewood': 'Lakewood',
  'flatbush': 'Flatbush',
  'brooklyn': 'Flatbush',
  'crown heights': 'Crown Heights',
  'crown': 'Crown Heights',
  'monsey': 'Monsey',
  'spring val': 'Monsey',
  'online': 'Online',
  'web': 'Online',
  'reserve': 'Reserve',
  'warehouse': 'Reserve',
  'storage': 'Reserve',
  'wholesale': 'Wholesale',
};

function normalizeName(name) {
  if (!name) return 'Online';
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(STORE_NORMALIZE)) {
    if (lower.includes(key)) return val;
  }
  return name;
}

// Fetch and cache location_id → normalized store name mapping
let _locationMap = null;
let _locationMapExpiry = 0;

async function getLocationMap(client) {
  if (_locationMap && Date.now() < _locationMapExpiry) return _locationMap;
  try {
    const { locations } = await client.getLocations();
    _locationMap = {};
    for (const loc of locations) {
      _locationMap[loc.id] = normalizeName(loc.name);
    }
    _locationMapExpiry = Date.now() + 300000; // 5 min
    return _locationMap;
  } catch (e) {
    console.warn('[pos] Failed to fetch locations:', e.message);
    return _locationMap || {};
  }
}

// Resolve an order to its store name
function resolveStore(order, locationMap) {
  // 1. Use location_id if present (POS orders)
  if (order.location_id && locationMap[order.location_id]) {
    return locationMap[order.location_id];
  }
  // 2. Check source_name for POS channel clues
  if (order.source_name === 'pos' || order.source_name === 'shopify_pos') {
    // POS order without location_id — shouldn't happen but fallback
    return 'In-Store';
  }
  // 3. Check fulfillment location
  if (order.fulfillments && order.fulfillments.length > 0) {
    const locId = order.fulfillments[0].location_id;
    if (locId && locationMap[locId]) return locationMap[locId];
  }
  // 4. Web / draft / API orders → Online
  if (!order.source_name || order.source_name === 'web' || order.source_name === 'shopify') {
    return 'Online';
  }
  // 5. Fallback — normalize whatever source_name says
  return normalizeName(order.source_name);
}

// ── Aggregate orders into store buckets ─────────────────────

function aggregateByStore(orders, locationMap) {
  let totalRevenue = 0;
  let totalUnits = 0;
  const byStore = {};

  for (const order of orders) {
    const revenue = parseFloat(order.total_price) || 0;
    totalRevenue += revenue;
    const store = resolveStore(order, locationMap);
    const bucket = byStore[store] || (byStore[store] = { store, revenue: 0, orders: 0, units: 0, avgOrder: 0 });
    bucket.revenue += revenue;
    bucket.orders++;
    for (const li of order.line_items) {
      const qty = li.quantity || 0;
      totalUnits += qty;
      bucket.units += qty;
    }
  }

  // Finalize
  for (const s of Object.values(byStore)) {
    s.revenue = +s.revenue.toFixed(2);
    s.avgOrder = s.orders ? +(s.revenue / s.orders).toFixed(2) : 0;
  }

  return {
    totalRevenue: +totalRevenue.toFixed(2),
    totalOrders: orders.length,
    totalUnits,
    byStore: Object.values(byStore).sort((a, b) => b.revenue - a.revenue),
  };
}

// ── Handlers ────────────────────────────────────────────────

async function todaySales(client) {
  const ck = cache.makeKey('pos-today', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const locationMap = await getLocationMap(client);
  const { orders } = await client.getOrders({ created_at_min: today + 'T00:00:00Z' });
  const agg = aggregateByStore(orders, locationMap);

  const result = { date: today, ...agg };
  cache.set(ck, result, cache.CACHE_TTL.pos);
  return result;
}

async function byLocation(client, { params }) {
  const days = parseInt(params.days || '7', 10);
  const ck = cache.makeKey('pos-location', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const locationMap = await getLocationMap(client);
  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const agg = aggregateByStore(orders, locationMap);

  const result = { days, stores: agg.byStore };
  cache.set(ck, result, cache.CACHE_TTL.pos);
  return result;
}

async function transactionFeed(client, { params }) {
  const limit = parseInt(params.limit || '50', 10);
  const locationMap = await getLocationMap(client);
  const { orders } = await client.getOrders({ created_at_min: sinceDate(7) });

  const transactions = orders
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map(o => ({
      id: o.id,
      name: o.name,
      store: resolveStore(o, locationMap),
      total: o.total_price,
      items: o.line_items.length,
      units: o.line_items.reduce((s, li) => s + (li.quantity || 0), 0),
      customer: o.customer
        ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() || 'Guest'
        : 'Guest',
      createdAt: o.created_at,
      status: o.financial_status,
    }));

  return { count: transactions.length, transactions };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET', path: 'today',       handler: todaySales },
  { method: 'GET', path: 'by-location', handler: byLocation },
  { method: 'GET', path: 'feed',        handler: transactionFeed },
];

exports.handler = createHandler(ROUTES, 'pos');
