/**
 * /api/orders/* — Order data from Shopify
 * Owner: Stallon (API layer)
 * 
 * Routes:
 *   GET  /api/orders           → list orders (with ?since= filter)
 *   POST /api/orders/sync      → sync orders from Shopify
 *   GET  /api/orders/velocity  → velocity by SKU (?days=30)
 *   GET  /api/orders/sales     → sales summary (?days=30)
 *   GET  /api/orders/drafts    → draft orders
 */

const { createHandler } = require('../../lib/handler');
const { mapOrder } = require('../../lib/mappers');
const { sinceDate, buildVelocity, buildSalesSummary } = require('../../lib/analytics');
const cache = require('../../lib/cache');

// ── Handlers ────────────────────────────────────────────────

async function listOrders(client, { params }) {
  // Default to 90 days if no since filter — never fetch entire history
  const since = params.since || sinceDate(90);
  const ck = cache.makeKey('orders', { since });
  const cached = cache.get(ck);
  if (cached) return { ...cached, _cached: true };

  const { orders } = await client.getOrders({ created_at_min: since });
  const result = { count: orders.length, orders: orders.map(mapOrder) };
  cache.set(ck, result, cache.CACHE_TTL.orders);
  return result;
}

async function syncOrders(client, { body, params }) {
  const since = body.since || params.since || sinceDate(90);
  const { orders } = await client.getOrders({ created_at_min: since });
  const result = { count: orders.length, orders: orders.map(mapOrder) };
  cache.set(cache.makeKey('orders', { since }), result, cache.CACHE_TTL.orders);
  return result;
}

async function velocity(client, { params }) {
  const days = Math.min(parseInt(params.days || '30', 10), 365);
  const ck = cache.makeKey('velocity', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const result = { days, orderCount: orders.length, velocity: buildVelocity(orders, days) };
  cache.set(ck, result, cache.CACHE_TTL.velocity);
  return result;
}

async function sales(client, { params }) {
  const days = Math.min(parseInt(params.days || '30', 10), 365);
  const ck = cache.makeKey('sales', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const result = buildSalesSummary(orders, days);
  cache.set(ck, result, cache.CACHE_TTL.sales);
  return result;
}

async function draftOrders(client, { params }) {
  const status = params.status || 'open';
  let all = [];
  try {
    all = await client._fetchAll('/draft_orders.json', 'draft_orders', { status, limit: '250' });
  } catch (e) {
    all = [];
  }
  return {
    count: all.length,
    draftOrders: all.map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      lineItems: (d.line_items || []).map(li => ({
        title: li.title,
        sku: li.sku,
        quantity: li.quantity,
        price: li.price,
        vendor: li.vendor,
      })),
      totalPrice: d.total_price,
      note: d.note,
      tags: d.tags,
    })),
  };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: '',         handler: listOrders },
  { method: 'POST',  path: 'sync',     handler: syncOrders },
  { method: 'GET',   path: 'velocity', handler: velocity },
  { method: 'GET',   path: 'sales',    handler: sales },
  { method: 'GET',   path: 'drafts',   handler: draftOrders },
];

exports.handler = createHandler(ROUTES, 'orders');
