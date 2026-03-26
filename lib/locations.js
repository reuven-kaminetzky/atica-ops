/**
 * Location normalization — single source of truth
 * 
 * Every function that maps Shopify data to store names
 * must use this module. Never inline store name logic.
 * 
 * Stores: Lakewood, Flatbush, Crown Heights, Monsey, Online, Reserve
 */

// Canonical store list — add new stores HERE, not in individual functions
const STORES = ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey', 'Online', 'Reserve'];

// Pattern → canonical name mapping
const PATTERNS = [
  [/lakewood/i,                         'Lakewood'],
  [/flatbush|brooklyn/i,                'Flatbush'],
  [/crown\s*heights?/i,                 'Crown Heights'],
  [/monsey|spring\s*val/i,              'Monsey'],
  [/online|web|shopify(?!_pos)/i,       'Online'],
  [/reserve|warehouse|storage/i,        'Reserve'],
  [/wholesale/i,                        'Wholesale'],
];

/**
 * Normalize a raw location/store name to a canonical store name.
 * @param {string} name - Raw name from Shopify (location name, source_name, etc.)
 * @returns {string} Canonical store name
 */
function normalize(name) {
  if (!name) return 'Online';
  for (const [pattern, canonical] of PATTERNS) {
    if (pattern.test(name)) return canonical;
  }
  return name; // Unknown location — return as-is
}

/**
 * Resolve an order to its physical store.
 * Checks location_id first (POS), then fulfillment, then source.
 * @param {object} order - Raw Shopify order
 * @param {object} locationMap - { locationId: locationName } from getLocations()
 * @returns {string} Canonical store name
 */
function resolveOrderStore(order, locationMap) {
  // 1. Direct location_id (POS orders)
  if (order.location_id && locationMap[order.location_id]) {
    return normalize(locationMap[order.location_id]);
  }
  // 2. Fulfillment location
  if (order.fulfillments?.length > 0) {
    const locId = order.fulfillments[0].location_id;
    if (locId && locationMap[locId]) return normalize(locationMap[locId]);
  }
  // 3. Source-based fallback
  const src = order.source_name || '';
  if (src === 'pos' || src === 'shopify_pos') return 'In-Store';
  if (!src || src === 'web' || src === 'shopify') return 'Online';
  return normalize(src);
}

/**
 * Build a location_id → canonical name map from Shopify locations.
 * @param {Array} locations - Shopify locations array from getLocations()
 * @returns {object} { locationId: canonicalName }
 */
function buildLocationMap(locations) {
  const map = {};
  for (const loc of locations) {
    map[loc.id] = normalize(loc.name);
  }
  return map;
}

module.exports = { STORES, normalize, resolveOrderStore, buildLocationMap };
