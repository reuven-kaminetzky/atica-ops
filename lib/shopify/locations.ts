// ═══════════════════════════════════════════════════════════════
// Stallon: Location normalizer
// Maps Shopify's location names → Atica's canonical store names
// ═══════════════════════════════════════════════════════════════

export const ATICA_STORES = [
  'Lakewood', 'Flatbush', 'Crown Heights', 'Monsey',
  'Online', 'Reserve', 'Wholesale',
] as const;

export type AticaStore = (typeof ATICA_STORES)[number];

const PATTERNS: [RegExp, AticaStore][] = [
  [/lakewood/i,                    'Lakewood'],
  [/flatbush|brooklyn/i,           'Flatbush'],
  [/crown/i,                       'Crown Heights'],
  [/monsey|spring\s*val/i,         'Monsey'],
  [/online|web|shopify/i,          'Online'],
  [/reserve|warehouse|storage/i,   'Reserve'],
  [/wholesale/i,                   'Wholesale'],
];

export function normalizeLocation(shopifyName: string): AticaStore | string {
  const s = (shopifyName || '').trim();
  for (const [pattern, store] of PATTERNS) {
    if (pattern.test(s)) return store;
  }
  return s; // return as-is if no match
}

// Build a { storeName: totalAvailable } map from inventory levels + locations
export function buildStoreInventory(
  locations: { locationId: number; locationName: string; levels: { inventoryItemId: number; available: number }[] }[]
): Record<string, Record<number, number>> {
  // Returns: { "Lakewood": { inventoryItemId: available, ... }, ... }
  const result: Record<string, Record<number, number>> = {};
  for (const loc of locations) {
    const storeName = normalizeLocation(loc.locationName);
    if (!result[storeName]) result[storeName] = {};
    for (const lvl of loc.levels) {
      result[storeName][lvl.inventoryItemId] = 
        (result[storeName][lvl.inventoryItemId] || 0) + lvl.available;
    }
  }
  return result;
}
