/**
 * /api/pos/* — Point of Sale data
 * Owner: Stallon (API layer), consumed by Deshawn (POS module)
 * 
 * Uses lib/locations.js for store resolution — single source of truth.
 * 
 * Routes:
 *   GET /api/pos/today       → today's sales across all stores
 *   GET /api/pos/by-location → sales grouped by location (?days=7)
 *   GET /api/pos/feed        → recent transactions (?limit=50)
 */

const { createHandler } = require('../../lib/handler');
const { sinceDate } = require('../../lib/analytics');
const { resolveOrderStore, buildLocationMap } = require('../../lib/locations');
const cache = require('../../lib/cache');

// ── Location map cache (5 min within container) ─────────────
let _locationMap = null;
let _locationMapExpiry = 0;

async function getLocationMap(client) {
  if (_locationMap && Date.now() < _locationMapExpiry) return _locationMap;
  try {
    const { locations } = await client.getLocations();
    _locationMap = buildLocationMap(locations);
    _locationMapExpiry = Date.now() + 300000;
    return _locationMap;
  } catch (e) {
    console.warn('[pos] Failed to fetch locations:', e.message);
    return _locationMap || {};
  }
}

// ── Shared aggregation ──────────────────────────────────────

function aggregateByStore(orders, locationMap) {
  let totalRevenue = 0;
  let totalUnits = 0;
  const byStore = {};

  for (const order of orders) {
    const revenue = parseFloat(order.total_price) || 0;
    totalRevenue += revenue;
    const store = resolveOrderStore(order, locationMap);
    const bucket = byStore[store] || (byStore[store] = { store, revenue: 0, orders: 0, units: 0, avgOrder: 0 });
    bucket.revenue += revenue;
    bucket.orders++;
    for (const li of order.line_items) {
      const qty = li.quantity || 0;
      totalUnits += qty;
      bucket.units += qty;
    }
  }

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

  const result = { date: today, ...aggregateByStore(orders, locationMap) };
  cache.set(ck, result, cache.CACHE_TTL.pos);
  return result;
}

async function byLocation(client, { params }) {
  const days = Math.min(parseInt(params.days || '7', 10), 365);
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
  const limit = Math.min(parseInt(params.limit || '50', 10), 200);
  const locationMap = await getLocationMap(client);
  const { orders } = await client.getOrders({ created_at_min: sinceDate(7) });

  const transactions = orders
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map(o => ({
      id: o.id,
      name: o.name,
      store: resolveOrderStore(o, locationMap),
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
