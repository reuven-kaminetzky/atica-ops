/**
 * /api/workflow/* — Unified workflow endpoints
 * 
 * The cross-cutting API that ties MPs, POs, cash flow, and analytics together.
 * 
 * Routes:
 *   GET  /api/workflow/status          → unified MP status (phase + POs + stock + velocity)
 *   GET  /api/workflow/status/:id      → single MP status detail
 *   GET  /api/workflow/stack           → product stack phase definitions
 *   GET  /api/workflow/package/:id     → factory package for an MP
 *   GET  /api/workflow/cashflow        → cash flow projection (3-month)
 *   GET  /api/workflow/health          → system health summary
 */

const { createHandler, RouteError, validate } = require('../../lib/handler');
const { MP_SEEDS, MP_BY_ID, matchAll, classifyDemand, adjustVelocity } = require('../../lib/products');
const { sinceDate } = require('../../lib/analytics');
const { PRODUCT_STACK, ONGOING_PHASES, computeMPStatus, buildFactoryPackage,
        projectCashFlow, CASH_FLOW_CATEGORIES, DEFAULT_PAYMENT_TERMS } = require('../../lib/workflow');
const cache = require('../../lib/cache');
const store = require('../../lib/store');

// ── Unified MP Status ───────────────────────────────────────

async function unifiedStatus(client, { params }) {
  const days = validate.days(params, 30);
  const ck = cache.makeKey('workflow-status', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  // Fetch all data sources in parallel
  const [productsData, ordersData, inventoryData, posData, plmData] = await Promise.all([
    client.getProducts(),
    client.getOrders({ created_at_min: sinceDate(days) }),
    (async () => {
      const { locations } = await client.getLocations();
      const levels = {};
      for (const loc of locations) {
        const { inventory_levels } = await client.getInventoryLevels(loc.id);
        for (const l of inventory_levels) levels[l.inventory_item_id] = (levels[l.inventory_item_id] || 0) + (l.available || 0);
      }
      return levels;
    })(),
    (async () => { try { return await store.po.getAll(); } catch(e) { return []; } })(),
    (async () => { try { return await store.plm.getAll(); } catch(e) { return []; } })(),
  ]);

  // Build lookups
  const { matched } = matchAll(productsData.products);

  // Product ID → MP, Inventory Item → MP
  const itemToMP = {};
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) {
      for (const v of sp.variants) {
        if (v.inventory_item_id) itemToMP[v.inventory_item_id] = seedId;
      }
    }
  }

  // Inventory by MP
  const mpInventory = {};
  for (const [itemId, qty] of Object.entries(inventoryData)) {
    const mpId = itemToMP[itemId];
    if (mpId) mpInventory[mpId] = (mpInventory[mpId] || 0) + qty;
  }

  // Velocity by MP
  const productIdToMP = {};
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) productIdToMP[sp.id] = seedId;
  }

  const mpVelocity = {};
  for (const order of ordersData.orders) {
    for (const li of order.line_items) {
      const mpId = productIdToMP[li.product_id];
      if (!mpId) continue;
      if (!mpVelocity[mpId]) mpVelocity[mpId] = { units: 0 };
      mpVelocity[mpId].units += li.quantity;
    }
  }

  // Enrich velocity with signal
  for (const [mpId, vel] of Object.entries(mpVelocity)) {
    vel.unitsPerDay = +(vel.units / days).toFixed(2);
    const weeklyVel = vel.unitsPerDay * 7;
    const stock = mpInventory[mpId] || 0;
    const totalEver = stock + vel.units;
    const sellThrough = totalEver > 0 ? Math.round((vel.units / totalEver) * 100) : 0;
    vel.signal = stock === 0 && vel.units > 0 ? 'stockout' : classifyDemand(sellThrough, weeklyVel);
  }

  // PLM lookup
  const plmMap = {};
  for (const p of plmData) plmMap[p.mpId || p.key] = p;

  // Compute status for each MP
  const statuses = MP_SEEDS.map(mp =>
    computeMPStatus(mp, {
      pos: posData,
      inventory: mpInventory,
      velocity: mpVelocity,
      plmData: plmMap,
    })
  );

  // Summary
  const healthCounts = { healthy: 0, attention: 0, warning: 0, critical: 0 };
  for (const s of statuses) healthCounts[s.health]++;

  const result = {
    days,
    totalMPs: statuses.length,
    health: healthCounts,
    statuses,
  };

  cache.set(ck, result, 120); // 2 min cache
  return result;
}

// ── Single MP Status ────────────────────────────────────────

async function mpStatus(client, { params, pathParams }) {
  const full = await unifiedStatus(client, { params });
  const mpId = decodeURIComponent(pathParams.id);
  const status = full.statuses.find(s => s.mpId === mpId);
  if (!status) throw new RouteError(404, `MP not found: ${mpId}`);
  return status;
}

// ── Product Stack Definitions ───────────────────────────────

async function stackDefinitions() {
  return {
    phases: PRODUCT_STACK,
    ongoing: ONGOING_PHASES,
    totalPhases: PRODUCT_STACK.length + ONGOING_PHASES.length,
  };
}

// ── Factory Package ─────────────────────────────────────────

async function factoryPackage(client, { pathParams }) {
  const mpId = decodeURIComponent(pathParams.id);
  const seed = MP_BY_ID[mpId];
  if (!seed) throw new RouteError(404, `MP not found: ${mpId}`);

  // Get stack data (persisted phase data with specs)
  let stackData = null;
  try { stackData = await store.plm.get(mpId); } catch(e) {}

  const pkg = buildFactoryPackage(seed, stackData);
  return { mpId, name: seed.name, code: seed.code, package: pkg };
}

// ── Cash Flow Projection ────────────────────────────────────

async function cashFlowProjection(client, { params }) {
  const months = validate.intParam(params, 'months', { min: 1, max: 12, fallback: 3 });
  const days = validate.days(params, 30);

  const [posData, ordersData] = await Promise.all([
    (async () => { try { return await store.po.getAll(); } catch(e) { return []; } })(),
    client.getOrders({ created_at_min: sinceDate(days) }),
  ]);

  // Calculate revenue run rate
  const totalRevenue = ordersData.orders.reduce((s, o) =>
    s + parseFloat(o.total_price || o.subtotal_price || 0), 0);
  const revenuePerMonth = +(totalRevenue / days * 30.44).toFixed(2);

  // Current month actual
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const currentMonthRevenue = ordersData.orders
    .filter(o => new Date(o.created_at) >= monthStart)
    .reduce((s, o) => s + parseFloat(o.total_price || o.subtotal_price || 0), 0);

  const projections = projectCashFlow(posData, {
    revenuePerMonth,
    currentMonthRevenue: +currentMonthRevenue.toFixed(2),
  }, months);

  return {
    months,
    basedOnDays: days,
    revenueRunRate: revenuePerMonth,
    categories: CASH_FLOW_CATEGORIES,
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    projections,
  };
}

// ── System Health ───────────────────────────────────────────

async function systemHealth(client) {
  const ck = cache.makeKey('workflow-health', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const [posData, plmData] = await Promise.all([
    (async () => { try { return await store.po.getAll(); } catch(e) { return []; } })(),
    (async () => { try { return await store.plm.getAll(); } catch(e) { return []; } })(),
  ]);

  const activePOs = posData.filter(po => !['Received', 'Distribution'].includes(po.stage));
  const overduePOs = activePOs.filter(po => {
    if (!po.etd) return false;
    return new Date(po.etd) < new Date();
  });

  const result = {
    totalMPs: MP_SEEDS.length,
    mpsWithPLMData: plmData.length,
    totalPOs: posData.length,
    activePOs: activePOs.length,
    overduePOs: overduePOs.length,
    totalCommittedCost: +activePOs.reduce((s, po) => s + (po.fobTotal || 0), 0).toFixed(2),
    posByStage: activePOs.reduce((acc, po) => {
      acc[po.stage] = (acc[po.stage] || 0) + 1;
      return acc;
    }, {}),
  };

  cache.set(ck, result, 60);
  return result;
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET', path: 'status',      handler: unifiedStatus },
  { method: 'GET', path: 'status/:id',  handler: mpStatus },
  { method: 'GET', path: 'stack',       handler: stackDefinitions, noClient: true },
  { method: 'GET', path: 'package/:id', handler: factoryPackage,   noClient: true },
  { method: 'GET', path: 'cashflow',    handler: cashFlowProjection },
  { method: 'GET', path: 'health',      handler: systemHealth,     noClient: true },
];

exports.handler = createHandler(ROUTES, 'workflow');
