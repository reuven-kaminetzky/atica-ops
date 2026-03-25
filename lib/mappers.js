// lib/mappers.js — proxy to lib/shopify/mappers
const {
  mapProduct, mapVariant, mapOrder, mapLineItem,
  mapLedgerEntry, mapSnapshotProduct, mapSKU, buildProductTree,
} = require('./shopify/mappers');
module.exports = {
  mapProduct, mapVariant, mapOrder, mapLineItem,
  mapLedgerEntry, mapSnapshotProduct, mapSKU, buildProductTree,
};
