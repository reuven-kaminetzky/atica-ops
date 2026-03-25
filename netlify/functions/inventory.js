/**
 * /api/inventory/* — Inventory levels from Shopify
 * Owner: Stallon (API layer)
 * 
 * Routes:
 *   GET  /api/inventory        → all locations + levels (cached)
 *   POST /api/inventory/sync   → force sync
 *   POST /api/inventory/adjust → adjust stock level
 */

const { createHandler, RouteError } = require('../../lib/handler');
const cache = require('../../lib/cache');

// ── Handlers ────────────────────────────────────────────────

async function listInventory(client) {
  const ck = cache.makeKey('inventory', {});
  const cached = cache.get(ck);
  if (cached) return { ...cached, _cached: true };

  const { locations } = await client.getLocations();
  const result = [];
  for (const loc of locations) {
    const { inventory_levels } = await client.getInventoryLevels(loc.id);
    result.push({
      locationId:   loc.id,
      locationName: loc.name,
      levels: inventory_levels.map(l => ({
        inventoryItemId: l.inventory_item_id,
        available:       l.available,
        updatedAt:       l.updated_at,
      })),
    });
  }
  const data = { locations: result };
  cache.set(ck, data, cache.CACHE_TTL.inventory);
  return data;
}

async function syncInventory(client) {
  // Invalidate then fetch fresh
  cache.set(cache.makeKey('inventory', {}), null, 0);
  return listInventory(client);
}

async function adjustInventory(client, { body }) {
  const { inventoryItemId, locationId, adjustment } = body;
  if (!inventoryItemId || !locationId || adjustment === undefined) {
    throw new RouteError(400, 'inventoryItemId, locationId, and adjustment required');
  }
  const result = await client._request('/inventory_levels/adjust.json', {
    method: 'POST',
    body: JSON.stringify({
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available_adjustment: adjustment,
    }),
  });
  // Invalidate inventory cache after adjustment
  cache.set(cache.makeKey('inventory', {}), null, 0);
  return { adjusted: true, inventoryLevel: result.inventory_level };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',  path: '',       handler: listInventory },
  { method: 'POST', path: 'sync',   handler: syncInventory },
  { method: 'POST', path: 'adjust', handler: adjustInventory },
];

exports.handler = createHandler(ROUTES, 'inventory');
