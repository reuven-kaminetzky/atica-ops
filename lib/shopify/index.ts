// ═══════════════════════════════════════════════════════════════
// Stallon: lib/shopify barrel export
// ═══════════════════════════════════════════════════════════════

export { ShopifyClient, createClient } from './client';
export {
  mapProduct, mapVariant, mapOrder, mapLineItem,
  mapLedgerEntry, mapSnapshotProduct, mapSKU,
  buildProductTree,
} from './mappers';
export { sinceDate, buildVelocity, buildSalesSummary } from './analytics';
export type * from './types';
