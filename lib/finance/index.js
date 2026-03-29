/**
 * lib/finance/index.js — Finance Domain
 *
 * The money picture. Reads from Supply Chain (payments, POs),
 * Logistics (shipment-triggered duties), and Sales (revenue).
 * Writes payment statuses and projections.
 *
 * Finance subscribes to events to maintain its view:
 *   po.created → new AP commitment
 *   shipment.cleared → duty payment due
 *   shipment.received → balance payment due
 *   sale.recorded → revenue inflow
 */

const paymentQueries = require('../dal/payments');
const salesQueries = require('../dal/sales');
const dashboardQueries = require('../dal/dashboard');
const { projectCashFlow } = require('../workflow');
const { CASH_FLOW_CONFIG } = require('../domain');
const { landedCost } = require('../products');

module.exports = {
  // --- Cash flow ---
  projectCashFlow,
  CASH_FLOW_CONFIG,

  // --- Payments (finance manages status, supply chain creates them) ---
  getPaymentsDue:      paymentQueries.getAllWithPO,
  getOverduePayments:  paymentQueries.getOverdue,
  countDue:            paymentQueries.countDue,
  markPaid:            paymentQueries.markPaid,
  refreshStatuses:     paymentQueries.refreshStatuses,

  // --- Cash flow projection data ---
  getOutflowByWeek:    paymentQueries.getOutflowByWeek,
  getOutflowByMonth:   paymentQueries.getOutflowByMonth,
  getAPSummary:        paymentQueries.getAPSummary,
  getUpcomingPayments: paymentQueries.getUpcoming,

  // --- Revenue (sales table) ---
  getRevenueSummary:   salesQueries.getRevenueSummary,
  getRevenueByWeek:    salesQueries.getRevenueByWeek,
  getRevenueByMonth:   salesQueries.getRevenueByMonth,
  getRevenueByStore:   salesQueries.getRevenueByStore,
  getRevenueByMP:      salesQueries.getRevenueByMP,
  getDailyRevenue:     salesQueries.getDailyRevenue,

  // --- Margins ---
  landedCost,

  // --- Settings ---
  getOpex: async () => {
    const settings = await dashboardQueries.getSettings(['opex_monthly']);
    return settings.opex_monthly ? parseInt(settings.opex_monthly) : CASH_FLOW_CONFIG.opex;
  },
  setOpex: (value) => dashboardQueries.setSetting('opex_monthly', value),
};
