/**
 * lib/supply-chain/index.js — Supply Chain Domain
 *
 * Getting product made and delivered to the warehouse door.
 * POs, vendors, payments, stage gates.
 *
 * Boundary: ends when goods arrive at warehouse.
 * Emits po.received → Logistics picks it up.
 */

const poQueries = require('../dal/purchase-orders');
const vendorQueries = require('../dal/vendors');
const paymentQueries = require('../dal/payments');

const { PO_LIFECYCLE, PAYMENT_TYPES } = require('../domain');
const { onPOStageAdvanced, generatePaymentSchedule, refreshPaymentStatuses } = require('../effects');
const { emit, Events } = require('../events');

module.exports = {
  // --- PO queries ---
  po: {
    getAll:       poQueries.getAll,
    getById:      poQueries.getById,
    getActive:    poQueries.getActive,
    getByMP:      poQueries.getByMP,
    getByVendor:  poQueries.getByVendor,
    create:       poQueries.create,
    update:       poQueries.update,
    delete:       poQueries.delete,
    advanceStage: poQueries.advanceStage,
    countByStage: poQueries.countByStage,
    count:        poQueries.count,
    countActive:  poQueries.countActive,
    STAGES:       poQueries.STAGES,
  },

  // --- Vendor queries ---
  vendor: {
    getAll: vendorQueries.getAll,
    count:  vendorQueries.count,
  },

  // --- Payment queries ---
  payment: {
    getForPO:          paymentQueries.getForPO,
    getAllWithPO:       paymentQueries.getAllWithPO,
    getOverdue:        paymentQueries.getOverdue,
    countDue:          paymentQueries.countDue,
    markPaid:          paymentQueries.markPaid,
    refreshStatuses:   paymentQueries.refreshStatuses,
  },

  // --- Business logic ---
  PO_LIFECYCLE,
  PAYMENT_TYPES,
  onPOStageAdvanced,
  generatePaymentSchedule,
  refreshPaymentStatuses,
};
