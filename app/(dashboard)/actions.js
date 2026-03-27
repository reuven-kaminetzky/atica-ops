'use server';

/**
 * Server Actions — thin data fetchers for Server Components.
 *
 * Import from DOMAIN modules, not dal.
 * Each action is one domain call or a small composition.
 */

// Domain imports (lazy — modules loaded on first call)
const product     = () => require('../../lib/product');
const supplyChain = () => require('../../lib/supply-chain');
const finance     = () => require('../../lib/finance');
const dal         = () => require('../../lib/dal');  // dashboard only — no domain yet

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
  try { return await supplyChain().po.getAll(); }
  catch (e) { return []; }
}

export async function getVendors() {
  try { return await supplyChain().vendor.getAll(); }
  catch (e) { return []; }
}

export async function getCashFlowData() {
  try {
    const sc = supplyChain();
    const fin = finance();
    const [payments, activePOs, opex] = await Promise.all([
      sc.payment.getAllWithPO(),
      sc.po.getActive(),
      fin.getOpex(),
    ]);
    return { payments, activePOs, opexMonthly: opex };
  } catch (e) {
    return { payments: [], activePOs: [], opexMonthly: 25000 };
  }
}
