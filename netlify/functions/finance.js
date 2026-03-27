/**
 * /api/finance/* — Cash flow projection, margins, AP/AR
 * 
 * Cash flow is COMPUTED, not stored. It derives from:
 *   Revenue (actual): Shopify orders
 *   Revenue (projected): velocity × retail × 4.33/mo × seasonal
 *   Costs (actual): PO payments marked 'paid'
 *   Costs (planned): PO payments marked 'planned'/'upcoming'/'due'/'overdue'
 *   OpEx: configurable (default $25K/month)
 * 
 * Routes:
 *   GET /api/finance/projection     → 12-week forward cash flow
 *   GET /api/finance/margins        → margin analysis by MP
 *   GET /api/finance/ap             → accounts payable (PO payments due)
 */

const { createHandler, RouteError, validate } = require('../../lib/handler');
const { sinceDate } = require('../../lib/analytics');
const { MP_SEEDS, MP_BY_ID, matchAll, adjustVelocity, landedCost } = require('../../lib/products');
const { CASH_FLOW_CONFIG, PAYMENT_STATUSES } = require('../../lib/domain');
const cache = require('../../lib/cache');
const store = require('../../lib/store');

// ── 12-Week Projection ─────────────────────────────────────

async function projection(client, { params }) {
  const weeks = validate.intParam(params, 'weeks', { min: 4, max: 52, fallback: 12 });
  const opexMonthly = validate.intParam(params, 'opex', { min: 0, max: 500000, fallback: CASH_FLOW_CONFIG.opexMonthly });
  const ck = cache.makeKey('finance-projection', { weeks, opexMonthly });
  const cached = cache.get(ck);
  if (cached) return cached;

  // Fetch data
  const [ordersData, productsData] = await Promise.all([
    client.getOrders({ created_at_min: sinceDate(90) }),
    client.getProducts(),
  ]);

  let poData = [];
  poData = await store.po.getAll();

  const orders = ordersData.orders;
  const products = productsData.products;
  const { matched } = matchAll(products);

  // 1. Compute actual revenue (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentOrders = orders.filter(o => o.created_at >= thirtyDaysAgo);
  const actualRevenue30d = recentOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
  const avgWeeklyRevenue = actualRevenue30d / 4.33;

  // 2. Compute velocity-based projected weekly revenue
  const currentMonth = new Date().getMonth() + 1;
  const productIdToMP = {};
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) productIdToMP[sp.id] = seedId;
  }

  let projectedWeeklyRevenue = 0;
  const mpRevenue = {};
  for (const order of orders) {
    for (const li of order.line_items) {
      const mpId = productIdToMP[li.product_id];
      if (!mpId) continue;
      if (!mpRevenue[mpId]) mpRevenue[mpId] = 0;
      mpRevenue[mpId] += parseFloat(li.price) * li.quantity;
    }
  }
  // Seasonal-adjusted projection
  for (const [mpId, rev] of Object.entries(mpRevenue)) {
    const weeklyRev = rev / (90 / 7);
    projectedWeeklyRevenue += adjustVelocity(weeklyRev, currentMonth);
  }

  // 3. Collect PO payments (planned and actual)
  const now = new Date();
  const allPayments = [];
  for (const po of poData) {
    if (!po.payments) continue;
    for (const pmt of po.payments) {
      allPayments.push({
        poId: po.id,
        mpId: po.mpId,
        vendor: po.vendor,
        desc: pmt.desc || pmt.label || 'Payment',
        amount: parseFloat(pmt.amount) || 0,
        dueDate: pmt.due || pmt.dueDate || null,
        status: pmt.status || 'planned',
      });
    }
  }

  // Also compute FOB totals for POs without payment schedules
  const posWithoutPayments = poData.filter(po =>
    (!po.payments || po.payments.length === 0) &&
    !['Received', 'Distribution'].includes(po.stage) &&
    po.fobTotal > 0
  );

  for (const po of posWithoutPayments) {
    // Estimate: 30% deposit now, 70% on shipment
    const depositDue = po.createdAt || now.toISOString();
    const balanceDue = po.etd || new Date(Date.now() + (po.lead || 90) * 86400000).toISOString();
    allPayments.push({
      poId: po.id, mpId: po.mpId, vendor: po.vendor,
      desc: 'Estimated deposit (30%)', amount: po.fobTotal * 0.3,
      dueDate: depositDue, status: 'planned',
    });
    allPayments.push({
      poId: po.id, mpId: po.mpId, vendor: po.vendor,
      desc: 'Estimated balance (70%)', amount: po.fobTotal * 0.7,
      dueDate: balanceDue, status: 'planned',
    });
  }

  // 4. Build week-by-week projection
  const weeklyOpex = opexMonthly / 4.33;
  const weeklyProjection = [];

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(now.getTime() + w * 7 * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const weekLabel = weekStart.toISOString().slice(0, 10);

    // Revenue: use actual for first 4 weeks, projected after
    const weekRevenue = w < 4 ? avgWeeklyRevenue : projectedWeeklyRevenue;

    // Costs: sum PO payments due this week
    const weekPayments = allPayments.filter(p => {
      if (!p.dueDate) return false;
      const due = new Date(p.dueDate);
      return due >= weekStart && due < weekEnd;
    });
    const weekPOCost = weekPayments.reduce((s, p) => s + p.amount, 0);

    const weekTotalCost = weekPOCost + weeklyOpex;
    const weekNet = weekRevenue - weekTotalCost;

    weeklyProjection.push({
      week: w + 1,
      date: weekLabel,
      revenue: +weekRevenue.toFixed(2),
      poCost: +weekPOCost.toFixed(2),
      opex: +weeklyOpex.toFixed(2),
      totalCost: +weekTotalCost.toFixed(2),
      net: +weekNet.toFixed(2),
      cumulative: 0, // filled below
      payments: weekPayments.map(p => ({
        poId: p.poId, vendor: p.vendor, desc: p.desc,
        amount: +p.amount.toFixed(2), status: p.status,
      })),
    });
  }

  // Cumulative
  let cum = 0;
  for (const week of weeklyProjection) {
    cum += week.net;
    week.cumulative = +cum.toFixed(2);
  }

  const result = {
    weeks,
    opexMonthly,
    seasonalMultiplier: +adjustVelocity(1, currentMonth).toFixed(2),
    summary: {
      avgWeeklyRevenue: +avgWeeklyRevenue.toFixed(2),
      projectedWeeklyRevenue: +projectedWeeklyRevenue.toFixed(2),
      totalProjectedRevenue: +(weeklyProjection.reduce((s, w) => s + w.revenue, 0)).toFixed(2),
      totalPOCost: +(weeklyProjection.reduce((s, w) => s + w.poCost, 0)).toFixed(2),
      totalOpex: +(weeklyProjection.reduce((s, w) => s + w.opex, 0)).toFixed(2),
      totalNet: +(weeklyProjection.reduce((s, w) => s + w.net, 0)).toFixed(2),
      pendingPayments: allPayments.filter(p => p.status !== 'paid').length,
      overduePayments: allPayments.filter(p => p.status === 'overdue').length,
    },
    projection: weeklyProjection,
  };

  cache.set(ck, result, cache.CACHE_TTL.sales);
  return result;
}

// ── Margin Analysis ─────────────────────────────────────────

async function margins(client, { params }) {
  const days = validate.days(params);
  const ck = cache.makeKey('margins', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const { products } = await client.getProducts();
  const { matched } = matchAll(products);

  const productIdToMP = {};
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) productIdToMP[sp.id] = seedId;
  }

  const byMP = {};
  for (const order of orders) {
    for (const li of order.line_items) {
      const mpId = productIdToMP[li.product_id];
      if (!mpId) continue;
      const seed = MP_BY_ID[mpId];
      if (!byMP[mpId]) {
        byMP[mpId] = {
          mpId, name: seed?.name, code: seed?.code, cat: seed?.cat,
          fob: seed?.fob || 0, duty: seed?.duty || 0,
          revenue: 0, units: 0, cogs: 0,
        };
      }
      const price = parseFloat(li.price);
      byMP[mpId].revenue += price * li.quantity;
      byMP[mpId].units += li.quantity;
      byMP[mpId].cogs += landedCost(seed?.fob || 0, seed?.duty || 0) * li.quantity;
    }
  }

  const marginList = Object.values(byMP).map(mp => ({
    ...mp,
    revenue: +mp.revenue.toFixed(2),
    cogs: +mp.cogs.toFixed(2),
    grossProfit: +(mp.revenue - mp.cogs).toFixed(2),
    margin: mp.revenue > 0 ? +((mp.revenue - mp.cogs) / mp.revenue * 100).toFixed(1) : 0,
    avgPrice: mp.units > 0 ? +(mp.revenue / mp.units).toFixed(2) : 0,
    landed: +landedCost(mp.fob, mp.duty).toFixed(2),
  }));

  marginList.sort((a, b) => b.grossProfit - a.grossProfit);

  const totalRev = marginList.reduce((s, m) => s + m.revenue, 0);
  const totalCogs = marginList.reduce((s, m) => s + m.cogs, 0);

  const result = {
    days,
    summary: {
      totalRevenue: +totalRev.toFixed(2),
      totalCOGS: +totalCogs.toFixed(2),
      grossProfit: +(totalRev - totalCogs).toFixed(2),
      overallMargin: totalRev > 0 ? +((totalRev - totalCogs) / totalRev * 100).toFixed(1) : 0,
    },
    margins: marginList,
  };

  cache.set(ck, result, cache.CACHE_TTL.sales);
  return result;
}

// ── Accounts Payable ────────────────────────────────────────

async function accountsPayable() {
  let poData = [];
  poData = await store.po.getAll();

  const now = new Date();
  const payments = [];

  for (const po of poData) {
    if (po.payments) {
      for (const pmt of po.payments) {
        const due = pmt.due || pmt.dueDate;
        const dueDate = due ? new Date(due) : null;
        let status = pmt.status || 'planned';
        if (status !== 'paid' && dueDate && dueDate < now) status = 'overdue';

        payments.push({
          poId: po.id,
          mpId: po.mpId,
          mpName: po.mpName || null,
          vendor: po.vendor || null,
          desc: pmt.desc || pmt.label || 'Payment',
          amount: parseFloat(pmt.amount) || 0,
          dueDate: due || null,
          status,
          daysUntilDue: dueDate ? Math.round((dueDate - now) / 86400000) : null,
        });
      }
    }
  }

  payments.sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (b.status === 'overdue' && a.status !== 'overdue') return 1;
    return (a.daysUntilDue || 999) - (b.daysUntilDue || 999);
  });

  const totalDue = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0);
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

  return {
    summary: {
      totalDue: +totalDue.toFixed(2),
      totalOverdue: +totalOverdue.toFixed(2),
      totalPaid: +totalPaid.toFixed(2),
      count: payments.length,
      overdueCount: payments.filter(p => p.status === 'overdue').length,
    },
    payments,
  };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET', path: 'projection', handler: projection },
  { method: 'GET', path: 'margins',    handler: margins },
  { method: 'GET', path: 'ap',         handler: accountsPayable, noClient: true },
];

exports.handler = createHandler(ROUTES, 'finance');
