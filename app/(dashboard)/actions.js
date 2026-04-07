'use server';

const dal = () => require('../../lib/dal');
const product = () => require('../../lib/product');
const sc = () => require('../../lib/supply-chain');
const finance = () => require('../../lib/finance');

export async function getDbHealth() {
  try { return await dal().dashboard.getHealth(); }
  catch (e) { return { error: e.message }; }
}

export async function getProducts() {
  try { return await product().getAll(); }
  catch (e) { return []; }
}

export async function getProduct(id) {
  try { return await product().getById(id); }
  catch (e) { return null; }
}

export async function getPurchaseOrders() {
  try { return await sc().po.getAll(); }
  catch (e) { return []; }
}

export async function getVendors() {
  try { return await sc().vendor.getAll(); }
  catch (e) { return []; }
}

export async function getCashFlowData() {
  try {
    const s = sc();
    const f = finance();
    const [payments, activePOs, opex] = await Promise.all([
      s.payment.getAllWithPO(),
      s.po.getActive(),
      f.getOpex(),
    ]);
    return { payments, activePOs, opexMonthly: opex };
  } catch (e) {
    return { payments: [], activePOs: [], opexMonthly: 25000 };
  }
}

export async function getCashFlowProjection(weeks = 12) {
  try {
    const f = finance();
    const [outflow, inflow, apSummary, upcoming, opex] = await Promise.all([
      f.getOutflowByWeek(weeks),
      f.getRevenueByWeek(weeks),
      f.getAPSummary(),
      f.getUpcomingPayments(30),
      f.getOpex(),
    ]);
    return { outflow, inflow, apSummary, upcoming, opexMonthly: opex };
  } catch (e) {
    return { outflow: [], inflow: [], apSummary: {}, upcoming: [], opexMonthly: 25000 };
  }
}

export async function getRevenueDashboard(days = 30) {
  try {
    const f = finance();
    const [summary, byStore, byMP, daily] = await Promise.all([
      f.getRevenueSummary(days),
      f.getRevenueByStore(days),
      f.getRevenueByMP(days),
      f.getDailyRevenue(days),
    ]);
    return { summary, byStore, byMP, daily };
  } catch (e) {
    return { summary: {}, byStore: [], byMP: [], daily: [] };
  }
}

export async function getWarehouseData() {
  try {
    const logistics = require('../../lib/logistics');
    const s = sc();
    const [dashboard, receivingQueue, pendingTransfers, unconfirmed, activeRoutes, activePOs] = await Promise.all([
      logistics.getWarehouseDashboard(),
      logistics.receiving.getQueue().catch(() => []),
      logistics.transfer.getPending().catch(() => []),
      logistics.transfer.getUnconfirmed().catch(() => []),
      logistics.van.getActive().catch(() => []),
      s.po.getActive().catch(() => []),
    ]);
    // Incoming shipments = POs that are shipped or in_transit
    const incomingShipments = activePOs.filter(po => 
      po.stage === 'shipped' || po.stage === 'in_transit'
    );
    return { dashboard, receivingQueue, pendingTransfers, unconfirmed, activeRoutes, incomingShipments };
  } catch (e) {
    console.error('[actions] getWarehouseData:', e.message);
    return { dashboard: {}, receivingQueue: [], pendingTransfers: [], unconfirmed: [], activeRoutes: [], incomingShipments: [] };
  }
}

export async function getStoreData(store) {
  try {
    const logistics = require('../../lib/logistics');
    const product = require('../../lib/product');
    const sc = require('../../lib/supply-chain');

    const [incomingTransfers, unconfirmed, allProducts, activePOs] = await Promise.all([
      logistics.transfer.getForStore(store).catch(() => []),
      logistics.transfer.getUnconfirmed().catch(() => []),
      product.getAll().catch(() => []),
      sc.po.getActive().catch(() => []),
    ]);

    // Stock alerts for this store (using product-level data for now)
    const stockAlerts = allProducts
      .filter(p => (parseInt(p.total_inventory) || 0) === 0 || (parseInt(p.days_of_stock) || 999) <= 30)
      .slice(0, 10);

    // POs arriving soon (shallow view)
    const incomingPOs = activePOs
      .filter(po => po.stage === 'shipped' || po.stage === 'in_transit' || po.stage === 'received')
      .slice(0, 5);

    // Transfers needing this store's confirmation
    const needsConfirmation = unconfirmed.filter(t => t.to_location === store);

    return {
      incomingTransfers,
      needsConfirmation,
      stockAlerts,
      incomingPOs,
      store,
    };
  } catch (e) {
    console.error('[actions] getStoreData:', e.message);
    return { incomingTransfers: [], needsConfirmation: [], stockAlerts: [], incomingPOs: [], store };
  }
}

// ── Mutations (for client components) ──

export async function createPurchaseOrder(data) {
  'use server';
  try {
    const sc = require('../../lib/supply-chain');
    const { emit, Events } = require('../../lib/events');
    const { validatePOCreate } = require('../../lib/validate');

    const { valid, data: clean, error } = validatePOCreate(data);
    if (!valid) return { error };

    const po = await sc.po.create(clean);

    await emit(Events.PO_CREATED, { poId: po.id, mpId: po.mp_id, vendor: po.vendor_name });

    return { created: true, po };
  } catch (e) { return { error: e.message }; }
}

export async function advancePOStage(poId, body) {
  'use server';
  try {
    const sc = require('../../lib/supply-chain');
    const { emit, Events } = require('../../lib/events');

    const po = await sc.po.getById(poId);
    if (!po) return { error: 'PO not found' };

    const updated = await sc.po.advanceStage(poId, {
      proof: body.proof || null,
      advancedBy: body.advancedBy || null,
    });

    await emit(Events.PO_STAGE_ADVANCED, {
      poId, fromStage: po.stage, toStage: updated.stage,
    });

    return { advanced: true, po: updated };
  } catch (e) { return { error: e.message }; }
}

export async function updateStack(mpId, updates) {
  'use server';
  try {
    const product = require('../../lib/product');
    const { emit, Events } = require('../../lib/events');

    const result = await product.updateStack(mpId, updates);

    if (result.changed) {
      await emit(Events.STACK_UPDATED, { mpId, fields: Object.keys(updates), completeness: result.completeness });
    }

    return result;
  } catch (e) { return { error: e.message }; }
}

export async function getProductList() {
  'use server';
  try {
    const { sql } = require('../../lib/dal/db');
    const db = sql();
    return await db`SELECT id, name, category, code, fob, retail, hero_image, 
      total_inventory, velocity_per_week, days_of_stock, signal, vendor_id, phase
      FROM master_products ORDER BY category, name`;
  } catch (e) { return []; }
}

export async function getPurchaseOrder(id) {
  'use server';
  try {
    const sc = require('../../lib/supply-chain');
    return await sc.po.getById(id);
  } catch (e) { return null; }
}

export async function getOperationalSummary() {
  'use server';
  try {
    const summary = await dal().dashboard.getOperationalSummary();

    // lastSync comes from app_settings table only
    // (Blobs are not available in Next.js server routes — only in netlify/functions/)
    return summary;
  } catch (e) { return { error: e.message }; }
}

// ── Analytics ──────────────────────────────────────────────
export async function getDataBreakdown(opts = {}) {
  'use server';
  try {
    return await dal().analytics.getBreakdown(opts);
  } catch (e) { return { error: e.message, rows: [], totals: {} }; }
}

export async function getAnalyticsDimensions() {
  'use server';
  try {
    return dal().analytics.getDimensions();
  } catch (e) { return []; }
}

// ── Alerts ────────────────────────────────────────────────
export async function getAlerts(limit = 20) {
  'use server';
  try {
    return await dal().alerts.getUnacknowledged(limit);
  } catch (e) { return []; }
}

export async function getAlertSummary() {
  'use server';
  try {
    return await dal().alerts.countByType();
  } catch (e) { return []; }
}

export async function acknowledgeAlert(id) {
  'use server';
  try {
    return await dal().alerts.acknowledge(id);
  } catch (e) { return null; }
}

export async function refreshAlerts() {
  'use server';
  try {
    return await dal().alerts.refresh();
  } catch (e) { return { error: e.message }; }
}

// ── SKUs (Sprint 1) ──────────────────────────────────────
export async function getSkusByMP(mpId) {
  'use server';
  try {
    return await dal().skus.getByMP(mpId);
  } catch (e) { return []; }
}

export async function getFitSizeMatrix(mpId) {
  'use server';
  try {
    return await dal().skus.getFitSizeMatrix(mpId);
  } catch (e) { return []; }
}

// ── Inventory (Sprint 2) ─────────────────────────────────
export async function getStockByMP(mpId) {
  'use server';
  try {
    return await dal().inventory.getStockByMP(mpId);
  } catch (e) { return []; }
}

export async function getStockByLocation(locationCode) {
  'use server';
  try {
    return await dal().inventory.getStockByLocation(locationCode);
  } catch (e) { return []; }
}

// ── Orders (Sprint 3) ──────────────────────────────────
export async function getOrder(id) {
  'use server';
  try {
    return await dal().orders.getById(id);
  } catch (e) { return null; }
}

export async function getRecentOrders(limit = 50) {
  'use server';
  try {
    return await dal().orders.getRecent(limit);
  } catch (e) { return []; }
}

export async function getOrdersSummary(days = 30) {
  'use server';
  try {
    return await dal().orders.getSummary(days);
  } catch (e) { return {}; }
}

export async function getRevenueByDay(days = 30) {
  'use server';
  try {
    return await dal().orders.getRevenueByDay(days);
  } catch (e) { return []; }
}

export async function getRevenueByChannel(days = 30) {
  'use server';
  try {
    return await dal().orders.getRevenueByChannel(days);
  } catch (e) { return []; }
}

// ── Intelligence Layer ──────────────────────────────────
export async function getVendorScore(vendorId) {
  'use server';
  try {
    return await dal().vendors.computeScore(vendorId);
  } catch (e) { return { error: e.message }; }
}

export async function refreshStyleGrades() {
  'use server';
  try {
    return await dal().vendors.computeStyleGrades();
  } catch (e) { return { error: e.message }; }
}

// ── Stack Completeness (Sprint 4) ───────────────────────
export async function getStackCompleteness(mpId) {
  'use server';
  try {
    const p = product();
    const mp = await p.getById(mpId);
    if (!mp) return { error: 'MP not found' };
    return p.computeCompleteness(mp.stack || {}, mp);
  } catch (e) { return { error: e.message }; }
}

export async function checkPOStackGate(poId) {
  'use server';
  try {
    const p = product();
    const s = sc();
    const po = await s.po.getById(poId);
    if (!po) return { error: 'PO not found' };
    if (!po.mp_id) return { passed: true };
    const mp = await p.getById(po.mp_id);
    if (!mp) return { passed: true };
    const stages = s.po.STAGES;
    const currentIdx = stages.findIndex(st => st.name === po.stage);
    const nextStage = stages[currentIdx + 1];
    if (!nextStage) return { passed: true };
    return p.checkStackGate(nextStage.name, mp.stack || {}, mp, po);
  } catch (e) { return { error: e.message }; }
}

export async function getVendor(id) {
  'use server';
  try { return await dal().vendors.getById(id); }
  catch (e) { return null; }
}

// ── Transfers ─────────────────────────────────────────────
export async function createTransfer(data) {
  'use server';
  try {
    const logistics = require('../../lib/logistics');
    return await logistics.transfer.create(data);
  } catch (e) { return { error: e.message }; }
}

export async function advanceTransfer(id, status, by) {
  'use server';
  try {
    const logistics = require('../../lib/logistics');
    return await logistics.transfer.advanceStatus(id, { status, by });
  } catch (e) { return { error: e.message }; }
}

export async function getAllTransfers() {
  'use server';
  try {
    const logistics = require('../../lib/logistics');
    return await logistics.transfer.getAll();
  } catch (e) { return []; }
}

// ── PO Receiving ──────────────────────────────────────────
export async function startReceiving(receivingId, receivedBy) {
  'use server';
  try {
    const logistics = require('../../lib/logistics');
    return await logistics.receiving.start(receivingId, receivedBy);
  } catch (e) { return { error: e.message }; }
}

export async function completeReceiving(receivingId, receivedItems, discrepancies) {
  'use server';
  try {
    const logistics = require('../../lib/logistics');
    return await logistics.receiving.complete(receivingId, receivedItems, discrepancies);
  } catch (e) { return { error: e.message }; }
}

export async function getTransfer(id) {
  'use server';
  try {
    const { sql } = require('../../lib/dal/db');
    const db = sql();
    const [row] = await db`SELECT * FROM transfers WHERE id = ${id}`;
    return row || null;
  } catch (e) { return null; }
}
