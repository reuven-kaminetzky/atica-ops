/**
 * /api/orders/* — Order data from Shopify
 * Owner: Stallon (API layer)
 * 
 * Routes:
 *   GET  /api/orders              → list orders (with ?since= filter)
 *   POST /api/orders/sync         → sync orders from Shopify
 *   GET  /api/orders/velocity     → velocity by SKU (?days=30)
 *   GET  /api/orders/sales        → sales summary (?days=30)
 *   GET  /api/orders/mp-velocity  → velocity by Master Product (?days=30)
 *   GET  /api/orders/drafts       → draft orders
 */

const { createHandler, validate } = require('../../lib/handler');
const { mapOrder } = require('../../lib/mappers');
const { sinceDate, buildVelocity, buildSalesSummary } = require('../../lib/analytics');
const { matchAll, MP_BY_ID, classifyDemand, adjustVelocity } = require('../../lib/products');
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
  const days = validate.days(params);
  const ck = cache.makeKey('velocity', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const result = { days, orderCount: orders.length, velocity: buildVelocity(orders, days) };
  cache.set(ck, result, cache.CACHE_TTL.velocity);
  return result;
}

async function sales(client, { params }) {
  const days = validate.days(params);
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

// ── MP-level analytics ──────────────────────────────────────
// Aggregates order data by Master Product, not by individual SKU.
// This is what drives production planning and reorder decisions.

async function mpVelocity(client, { params }) {
  const days = validate.days(params);
  const ck = cache.makeKey('mp-velocity', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  // Fetch orders + products in parallel
  const [ordersData, productsData] = await Promise.all([
    client.getOrders({ created_at_min: sinceDate(days) }),
    client.getProducts(),
  ]);

  const orders = ordersData.orders;
  const products = productsData.products;

  // Build product_id → MP seed ID lookup
  const { matched } = matchAll(products);
  const productIdToMP = {};
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) {
      productIdToMP[sp.id] = seedId;
    }
  }

  // Aggregate orders by MP
  const byMP = {};
  let unmatchedUnits = 0;
  let unmatchedRevenue = 0;

  for (const order of orders) {
    for (const li of order.line_items) {
      const mpId = productIdToMP[li.product_id];
      if (!mpId) {
        unmatchedUnits += li.quantity;
        unmatchedRevenue += parseFloat(li.price) * li.quantity;
        continue;
      }

      if (!byMP[mpId]) {
        const seed = MP_BY_ID[mpId];
        byMP[mpId] = {
          mpId,
          name: seed?.name || mpId,
          code: seed?.code || '',
          cat: seed?.cat || '',
          vendor: seed?.vendor || '',
          fob: seed?.fob || 0,
          retail: seed?.retail || 0,
          units: 0,
          revenue: 0,
          orders: 0,
          orderIds: new Set(),
        };
      }
      byMP[mpId].units += li.quantity;
      byMP[mpId].revenue += parseFloat(li.price) * li.quantity;
      byMP[mpId].orderIds.add(order.id);
    }
  }

  // Compute velocity, demand signals, and production projections
  const currentMonth = new Date().getMonth() + 1;
  const mpList = Object.values(byMP).map(mp => {
    mp.orders = mp.orderIds.size;
    delete mp.orderIds;
    mp.revenue = +mp.revenue.toFixed(2);
    mp.unitsPerDay = +(mp.units / days).toFixed(2);
    mp.revenuePerDay = +(mp.revenue / days).toFixed(2);
    mp.avgPrice = mp.units > 0 ? +(mp.revenue / mp.units).toFixed(2) : 0;
    mp.margin = mp.fob > 0 && mp.avgPrice > 0 ? +((1 - mp.fob / mp.avgPrice) * 100).toFixed(1) : null;

    // Seasonal-adjusted velocity
    const weeklyVel = mp.unitsPerDay * 7;
    mp.velocityPerWeek = +weeklyVel.toFixed(1);
    mp.adjustedPerWeek = +adjustVelocity(weeklyVel, currentMonth).toFixed(1);

    // Demand signal
    // Rough sell-through: units sold / (units sold + theoretical remaining)
    const estimatedSellThrough = mp.units > 0 ? Math.min(95, Math.round(mp.units / (mp.units * 1.5) * 100)) : 0;
    mp.signal = classifyDemand(estimatedSellThrough, weeklyVel);

    // Production planning
    mp.projectedMonthly = Math.round(mp.adjustedPerWeek * 4.33);
    mp.projectedQuarterly = Math.round(mp.adjustedPerWeek * 13);

    return mp;
  });

  mpList.sort((a, b) => b.units - a.units);

  const result = {
    days,
    seasonalMultiplier: +adjustVelocity(1, currentMonth).toFixed(2),
    totalOrders: orders.length,
    totalMPs: mpList.length,
    velocity: mpList,
    summary: {
      totalUnits: mpList.reduce((s, m) => s + m.units, 0),
      totalRevenue: +mpList.reduce((s, m) => s + m.revenue, 0).toFixed(2),
      unmatchedUnits,
      unmatchedRevenue: +unmatchedRevenue.toFixed(2),
      topCategory: (() => {
        const byCat = {};
        for (const m of mpList) byCat[m.cat] = (byCat[m.cat] || 0) + m.units;
        return Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      })(),
      signals: {
        hot: mpList.filter(m => m.signal === 'hot').length,
        rising: mpList.filter(m => m.signal === 'rising').length,
        steady: mpList.filter(m => m.signal === 'steady').length,
        slow: mpList.filter(m => m.signal === 'slow').length,
      },
    },
  };

  cache.set(ck, result, cache.CACHE_TTL.velocity);
  return result;
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: '',            handler: listOrders },
  { method: 'POST',  path: 'sync',        handler: syncOrders },
  { method: 'GET',   path: 'velocity',    handler: velocity },
  { method: 'GET',   path: 'sales',       handler: sales },
  { method: 'GET',   path: 'mp-velocity', handler: mpVelocity },
  { method: 'GET',   path: 'drafts',      handler: draftOrders },
];

exports.handler = createHandler(ROUTES, 'orders');
