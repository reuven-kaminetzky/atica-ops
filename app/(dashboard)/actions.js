'use server';

/**
 * Server Actions — thin wrappers around DAL
 * 
 * NO SQL HERE. All data access goes through lib/dal/.
 * These exist only because Next.js Server Components need
 * 'use server' functions to fetch data.
 */

export async function getDbHealth() {
  try {
    const { dashboard } = require('../../lib/dal');
    return await dashboard.getHealth();
  } catch (e) {
    return { error: e.message };
  }
}

export async function getProducts() {
  try {
    const { products } = require('../../lib/dal');
    return await products.getAll();
  } catch (e) {
    console.error('[actions] getProducts:', e.message);
    return [];
  }
}

export async function getProduct(id) {
  try {
    const { products } = require('../../lib/dal');
    return await products.getById(id);
  } catch (e) {
    console.error('[actions] getProduct:', e.message);
    return null;
  }
}

export async function getPurchaseOrders() {
  try {
    const { purchaseOrders } = require('../../lib/dal');
    return await purchaseOrders.getAll();
  } catch (e) {
    console.error('[actions] getPurchaseOrders:', e.message);
    return [];
  }
}

export async function getVendors() {
  try {
    const { vendors } = require('../../lib/dal');
    return await vendors.getAll();
  } catch (e) {
    console.error('[actions] getVendors:', e.message);
    return [];
  }
}

export async function getCashFlowData() {
  try {
    const { payments, purchaseOrders, dashboard } = require('../../lib/dal');
    const [allPayments, activePOs, settings] = await Promise.all([
      payments.getAllWithPO(),
      purchaseOrders.getActive(),
      dashboard.getSettings(['opex_monthly', 'target_cover_weeks']),
    ]);
    return {
      payments: allPayments,
      activePOs,
      opexMonthly: settings.opex_monthly ? parseInt(settings.opex_monthly) : 25000,
    };
  } catch (e) {
    console.error('[actions] getCashFlowData:', e.message);
    return { payments: [], activePOs: [], opexMonthly: 25000 };
  }
}
