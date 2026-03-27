/**
 * lib/product/index.js — Product Domain
 *
 * Everything about what we sell: MP lifecycle, tech packs,
 * Shopify matching, demand signals, velocity.
 *
 * This is the PUBLIC API. Import only from here.
 *   const product = require('../lib/product');
 *   const mp = await product.getById('londoner');
 */

// Queries (database access)
const queries = require('../dal/products');

// Business logic (pure functions, no DB)
const {
  MP_SEEDS, MP_BY_ID, CATEGORIES, PLM_STAGES,
  matchProduct, matchAll, TITLE_MATCHERS,
  classifyDemand, adjustVelocity, suggestDistribution,
  landedCost, reorderQuantity,
} = require('../products');

const {
  MP_LIFECYCLE, FACTORY_PACKAGE_SECTIONS,
  MP_STATUS_RULES, ENTITY_RELATIONS,
} = require('../domain');

const { computeMPStatus, buildFactoryPackage } = require('../workflow');

module.exports = {
  // --- Queries ---
  getAll:              queries.getAll,
  getById:             queries.getById,
  updatePhase:         queries.updatePhase,
  updateStack:         queries.updateStack,
  updateInventory:     queries.updateInventory,
  updateShopifyData:   queries.updateShopifyData,
  updateVelocity:      queries.updateVelocity,
  updateTotalInventory: queries.updateTotalInventory,
  deductInventory:     queries.deductInventory,
  addInventory:        queries.addInventory,
  count:               queries.count,

  // --- Styles ---
  upsertStyle:         queries.upsertStyle,
  getStylesByMp:       queries.getStylesByMp,

  // --- Business logic ---
  MP_SEEDS,
  MP_BY_ID,
  CATEGORIES,
  PLM_STAGES,
  MP_LIFECYCLE,
  FACTORY_PACKAGE_SECTIONS,
  MP_STATUS_RULES,

  matchProduct,
  matchAll,
  classifyDemand,
  adjustVelocity,
  suggestDistribution,
  landedCost,
  reorderQuantity,
  computeMPStatus,
  buildFactoryPackage,
};
