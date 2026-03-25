/**
 * /api/pos/* — Point of Sale data
 * Owner: Stallon (API layer), consumed by Deshawn (POS module)
 * 
 * POS-specific views of order data — filtered by location,
 * grouped by store, real-time-ish with short cache.
 * 
 * Routes:
 *   GET /api/pos/today       → today's sales across all stores
 *   GET /api/pos/by-location → sales grouped by location (?days=7)
 *   GET /api/pos/feed        → recent transactions (?limit=50)
 */

const { createHandler } = require('../../lib/handler');
const { mapOrder } = require('../../lib/mappers');
const { sinceDate } = require('../../lib/analytics');
const cache = require('../../lib/cache');

// ── Location name normalizer ────────────────────────────────
const STORE_NAMES = {
  'lakewood': 'Lakewood',
  'flatbush': 'Flatbush',
  'crown heights': 'Crown Heights',
  'monsey': 'Monsey',
};

function normalizeLocation(name) {
  if (!name) return 'Online';
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(STORE_NAMES)) {
    if (lower.includes(key)) return val;
  }
  return name;
}

// ── Handlers ────────────────────────────────────────────────

async function todaySales(client) {
  const ck = cache.makeKey('pos-today', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const { orders } = await client.getOrders({ created_at_min: today + 'T00:00:00Z' });

  let totalRevenue = 0;
  let totalUnits = 0;
  const byStore = {};

  for (const order of orders) {
    const revenue = parseFloat(order.total_price);
    totalRevenue += revenue;
    const store = normalizeLocation(order.source_name);
    const bucket = byStore[store] || (byStore[store] = { store, revenue: 0, orders: 0, units: 0 });
    bucket.revenue += revenue;
    bucket.orders++;
    for (const li of order.line_items) {
      totalUnits += li.quantity;
      bucket.units += li.quantity;
    }
  }

  const result = {
    date: today,
    totalRevenue: +totalRevenue.toFixed(2),
    totalOrders: orders.length,
    totalUnits,
    byStore: Object.values(byStore).sort((a, b) => b.revenue - a.revenue),
  };
  cache.set(ck, result, cache.CACHE_TTL.pos);
  return result;
}

async function byLocation(client, { params }) {
  const days = parseInt(params.days || '7', 10);
  const ck = cache.makeKey('pos-location', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const byStore = {};

  for (const order of orders) {
    const store = normalizeLocation(order.source_name);
    const bucket = byStore[store] || (byStore[store] = { store, revenue: 0, orders: 0, units: 0, avgOrder: 0 });
    bucket.revenue += parseFloat(order.total_price);
    bucket.orders++;
    for (const li of order.line_items) bucket.units += li.quantity;
  }

  // Calculate averages
  for (const store of Object.values(byStore)) {
    store.revenue = +store.revenue.toFixed(2);
    store.avgOrder = store.orders ? +(store.revenue / store.orders).toFixed(2) : 0;
  }

  const result = {
    days,
    stores: Object.values(byStore).sort((a, b) => b.revenue - a.revenue),
  };
  cache.set(ck, result, cache.CACHE_TTL.pos);
  return result;
}

async function transactionFeed(client, { params }) {
  const limit = parseInt(params.limit || '50', 10);
  const { orders } = await client.getOrders({ created_at_min: sinceDate(7) });

  const transactions = orders
    .slice(0, limit)
    .map(o => ({
      id: o.id,
      name: o.name,
      store: normalizeLocation(o.source_name),
      total: o.total_price,
      items: o.line_items.length,
      customer: o.customer
        ? `${o.customer.first_name} ${o.customer.last_name}`.trim()
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
