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
