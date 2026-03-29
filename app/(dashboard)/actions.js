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
    const salesDal = require('../../lib/dal/sales');
    const [payments, activePOs, opex, weeklyRevenue, salesSummary] = await Promise.all([
      s.payment.getAllWithPO(),
      s.po.getActive(),
      f.getOpex(),
      salesDal.getWeeklyRevenue(12).catch(() => []),
      salesDal.getSummary(30).catch(() => null),
    ]);
    return { payments, activePOs, opexMonthly: opex, weeklyRevenue, salesSummary };
  } catch (e) {
    return { payments: [], activePOs: [], opexMonthly: 25000, weeklyRevenue: [], salesSummary: null };
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
    const product = require('../../lib/product');
    const products = await product.getAll();
    return products.map(p => ({ id: p.id, name: p.name, category: p.category, code: p.code, fob: p.fob, retail: p.retail, duty: p.duty, hts: p.hts, lead_days: p.lead_days, moq: p.moq, vendor_id: p.vendor_id }));
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
  try { return await dal().dashboard.getOperationalSummary(); }
  catch (e) { return { error: e.message }; }
}
