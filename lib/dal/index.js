/**
 * lib/dal/index.js — Data Access Layer
 * 
 * Barrel export. Import like:
 *   const { products, purchaseOrders, vendors, payments, dashboard } = require('@/lib/dal');
 * 
 * RULES:
 *   1. ALL database queries go through DAL — never write SQL in pages or API routes
 *   2. DAL returns plain objects — no framework-specific types
 *   3. Business logic lives in lib/domain.js, lib/workflow.js, lib/effects.js
 *   4. DAL handles connection, query, error logging — callers just get data
 */

module.exports = {
  products:       require('./products'),
  purchaseOrders: require('./purchase-orders'),
  vendors:        require('./vendors'),
  payments:       require('./payments'),
  dashboard:      require('./dashboard'),
};
