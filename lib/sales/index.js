/**
 * lib/sales/index.js — Sales Domain
 *
 * Selling product: POS transactions, customers, wholesale, revenue.
 * Shopify POS is the source of truth for in-store sales.
 */

const dashboardQueries = require('../dal/dashboard');

module.exports = {
  // --- Queries (will grow as customer/wholesale tables are used) ---
  getSettings: dashboardQueries.getSettings,

  // --- Placeholder: these will call Shopify POS data ---
  // getTodayByStore(store) → today's sales for one store
  // getRevenueByPeriod(days) → revenue summary
  // getCustomer(id) → customer profile with order history
};
