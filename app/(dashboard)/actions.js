'use server';

/**
 * Server Actions — thin data fetchers for Server Components.
 * Import dal for database, events for side effects, shopify for Shopify.
 */

const dal = () => require('../../lib/dal');

export async function getDbHealth() {
  try { return await dal().dashboard.getHealth(); }
  catch (e) { return { error: e.message }; }
}

export async function getProducts() {
  try { return await dal().products.getAll(); }
  catch (e) { return []; }
}

export async function getProduct(id) {
  try { return await dal().products.getById(id); }
  catch (e) { return null; }
}

export async function getPurchaseOrders() {
  try { return await dal().purchaseOrders.getAll(); }
  catch (e) { return []; }
}

export async function getVendors() {
  try { return await dal().vendors.getAll(); }
  catch (e) { return []; }
}

export async function getCashFlowData() {
  try {
    const d = dal();
    const [payments, activePOs, settings] = await Promise.all([
      d.payments.getAllWithPO(),
      d.purchaseOrders.getActive(),
      d.dashboard.getSettings(['opex_monthly']),
    ]);
    return {
      payments,
      activePOs,
      opexMonthly: settings.opex_monthly ? parseInt(settings.opex_monthly) : 25000,
    };
  } catch (e) {
    return { payments: [], activePOs: [], opexMonthly: 25000 };
  }
}
