/**
 * lib/inventory/index.js — Inventory Domain
 *
 * How much product is where. The numbers, not the movement.
 * Stock levels, reorder calculation, distribution, demand signals.
 *
 * Inventory says "Monsey needs 30 units." Logistics makes it happen.
 */

const productQueries = require('../dal/products');
const { adjustVelocity, classifyDemand, suggestDistribution, reorderQuantity } = require('../products');
const { CASH_FLOW_CONFIG } = require('../domain');

module.exports = {
  // --- Stock queries ---
  getStockByProduct:  productQueries.getAll,  // includes total_inventory, days_of_stock
  updateInventory:    productQueries.updateInventory,

  // --- Reorder logic ---
  adjustVelocity,
  classifyDemand,
  suggestDistribution,
  reorderQuantity,

  // --- Config ---
  TARGET_COVER_WEEKS: CASH_FLOW_CONFIG.coverWeeks || 20,
};
