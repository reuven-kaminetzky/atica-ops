/**
 * lib/inventory.js — Shared Inventory Helpers
 * 
 * Eliminates duplicate inventory fetch logic across functions.
 * Each function gets its own cache copy (esbuild bundles separately),
 * but the LOGIC is in one place.
 */

const cache = require('./cache');

/**
 * Fetch all inventory across all locations.
 * Returns array of { id, name, levels: [...] } per location.
 * Cached per-function for CACHE_TTL.inventory (2 min).
 */
async function fetchAllInventory(client) {
  const ck = cache.makeKey('_inv_all', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const { locations } = await client.getLocations();
  const result = [];
  for (const loc of locations) {
    const { inventory_levels } = await client.getInventoryLevels(loc.id);
    result.push({ id: loc.id, name: loc.name, levels: inventory_levels });
  }
  cache.set(ck, result, cache.CACHE_TTL.inventory);
  return result;
}

/**
 * Build a flat map of inventoryItemId → total available across all locations.
 * Useful for quick stock lookups without location breakdown.
 */
async function fetchInventoryFlat(client) {
  const ck = cache.makeKey('_inv_flat', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const locations = await fetchAllInventory(client);
  const flat = {};
  for (const loc of locations) {
    for (const level of loc.levels) {
      flat[level.inventory_item_id] = (flat[level.inventory_item_id] || 0) + (level.available || 0);
    }
  }
  cache.set(ck, flat, cache.CACHE_TTL.inventory);
  return flat;
}

module.exports = { fetchAllInventory, fetchInventoryFlat };
