/**
 * lib/sales/index.js — Sales Domain
 *
 * Selling product: POS transactions, customers, wholesale, revenue.
 * Shopify POS is the source of truth for in-store sales.
 * Sales table populated by sync-background and webhook handlers.
 */

const salesQueries = require('../dal/sales');

module.exports = {
  getRevenueSummary:   salesQueries.getRevenueSummary,
  getRevenueByWeek:    salesQueries.getRevenueByWeek,
  getRevenueByMonth:   salesQueries.getRevenueByMonth,
  getRevenueByStore:   salesQueries.getRevenueByStore,
  getRevenueByMP:      salesQueries.getRevenueByMP,
  getDailyRevenue:     salesQueries.getDailyRevenue,
};
