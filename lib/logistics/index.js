/**
 * lib/logistics/index.js — Logistics Domain Module
 *
 * Physical movement: receiving, warehousing, transfers, van routing.
 * All SQL lives in lib/dal/logistics.js. This module re-exports
 * query methods and adds domain logic where needed.
 */

const dal = require('../dal/logistics');

module.exports = {
  receiving: dal.receiving,
  transfer:  dal.transfers,
  van:       dal.vanRoutes,
  bins:      dal.bins,
  getWarehouseDashboard: dal.getDashboard,
};
