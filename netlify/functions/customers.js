/**
 * /api/customers/* — Customer data from Shopify
 * Owner: Stallon (API layer)
 * 
 * Routes:
 *   GET  /api/customers              → list customers (paginated from Shopify)
 *   GET  /api/customers/:id          → single customer with order history
 *   GET  /api/customers/top?days=90  → top customers by spend
 *   GET  /api/customers/segments     → customer segments (new/returning/vip/dormant)
 */

const { createHandler, RouteError } = require('../../lib/handler');
const { sinceDate } = require('../../lib/analytics');
const cache = require('../../lib/cache');

// ── Handlers ────────────────────────────────────────────────

async function listCustomers(client, { params }) {
  const ck = cache.makeKey('customers', { page: params.page });
  const cached = cache.get(ck);
  if (cached) return { ...cached, _cached: true };

  const { customers } = await client.getCustomers(params);
  const result = {
    count: customers.length,
    customers: customers.map(mapCustomer),
  };
  cache.set(ck, result, 180); // 3 min
  return result;
}

async function getCustomer(client, { pathParams }) {
  const id = parseInt(pathParams.id, 10);
  if (isNaN(id)) throw new RouteError(400, 'Invalid customer ID');

  const data = await client._request(`/customers/${id}.json`);
  const customer = mapCustomer(data.customer);

  // Fetch their orders
  const { orders } = await client.getOrders({ customer_id: String(id) });
  customer.orders = orders.map(o => ({
    id: o.id,
    name: o.name,
    total: o.total_price,
    items: o.line_items.length,
    date: o.created_at,
    status: o.financial_status,
    fulfillment: o.fulfillment_status,
  }));
  customer.totalSpend = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
  customer.orderCount = orders.length;
  customer.avgOrder = customer.orderCount ? +(customer.totalSpend / customer.orderCount).toFixed(2) : 0;

  // Last order
  if (orders.length > 0) {
    const sorted = orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    customer.lastOrderDate = sorted[0].created_at;
    customer.daysSinceOrder = Math.floor((Date.now() - new Date(sorted[0].created_at)) / 86400000);
  }

  return customer;
}

async function topCustomers(client, { params }) {
  const days = Math.min(parseInt(params.days || '90', 10), 365);
  const ck = cache.makeKey('top-customers', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });

  // Aggregate by customer
  const byCustomer = {};
  for (const order of orders) {
    if (!order.customer) continue;
    const cid = order.customer.id;
    if (!byCustomer[cid]) {
      byCustomer[cid] = {
        id: cid,
        name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Guest',
        email: order.customer.email,
        spend: 0,
        orders: 0,
        units: 0,
        lastOrder: null,
      };
    }
    byCustomer[cid].spend += parseFloat(order.total_price || 0);
    byCustomer[cid].orders++;
    for (const li of order.line_items) byCustomer[cid].units += li.quantity;
    const orderDate = new Date(order.created_at);
    if (!byCustomer[cid].lastOrder || orderDate > new Date(byCustomer[cid].lastOrder)) {
      byCustomer[cid].lastOrder = order.created_at;
    }
  }

  const ranked = Object.values(byCustomer)
    .map(c => ({ ...c, spend: +c.spend.toFixed(2), avgOrder: c.orders ? +(c.spend / c.orders).toFixed(2) : 0 }))
    .sort((a, b) => b.spend - a.spend);

  const result = { days, count: ranked.length, customers: ranked.slice(0, 50) };
  cache.set(ck, result, 300); // 5 min
  return result;
}

async function customerSegments(client, { params }) {
  const days = Math.min(parseInt(params.days || '90', 10), 365);
  const ck = cache.makeKey('customer-segments', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });

  const now = Date.now();
  const byCustomer = {};

  for (const order of orders) {
    if (!order.customer) continue;
    const cid = order.customer.id;
    if (!byCustomer[cid]) {
      byCustomer[cid] = { id: cid, spend: 0, orders: 0, firstOrder: order.created_at, lastOrder: order.created_at };
    }
    byCustomer[cid].spend += parseFloat(order.total_price || 0);
    byCustomer[cid].orders++;
    if (new Date(order.created_at) > new Date(byCustomer[cid].lastOrder)) byCustomer[cid].lastOrder = order.created_at;
    if (new Date(order.created_at) < new Date(byCustomer[cid].firstOrder)) byCustomer[cid].firstOrder = order.created_at;
  }

  const segments = { new: 0, returning: 0, vip: 0, dormant: 0 };
  const segmentRevenue = { new: 0, returning: 0, vip: 0, dormant: 0 };

  for (const c of Object.values(byCustomer)) {
    const daysSinceLast = Math.floor((now - new Date(c.lastOrder)) / 86400000);

    if (c.spend >= 1000 || c.orders >= 5) {
      segments.vip++;
      segmentRevenue.vip += c.spend;
    } else if (daysSinceLast > 60) {
      segments.dormant++;
      segmentRevenue.dormant += c.spend;
    } else if (c.orders === 1) {
      segments.new++;
      segmentRevenue.new += c.spend;
    } else {
      segments.returning++;
      segmentRevenue.returning += c.spend;
    }
  }

  const result = {
    days,
    totalCustomers: Object.keys(byCustomer).length,
    segments: Object.entries(segments).map(([name, count]) => ({
      name,
      count,
      revenue: +segmentRevenue[name].toFixed(2),
      pct: Object.keys(byCustomer).length ? +(count / Object.keys(byCustomer).length * 100).toFixed(1) : 0,
    })),
  };
  cache.set(ck, result, 300);
  return result;
}

// ── Mapper ──────────────────────────────────────────────────

function mapCustomer(c) {
  return {
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email,
    phone: c.phone,
    ordersCount: c.orders_count,
    totalSpent: c.total_spent,
    tags: c.tags,
    city: c.default_address?.city,
    province: c.default_address?.province,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    acceptsMarketing: c.accepts_marketing,
  };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET', path: '',         handler: listCustomers },
  { method: 'GET', path: 'top',      handler: topCustomers },
  { method: 'GET', path: 'segments', handler: customerSegments },
  { method: 'GET', path: ':id',      handler: getCustomer },
];

exports.handler = createHandler(ROUTES, 'customers');
