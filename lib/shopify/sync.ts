// ═══════════════════════════════════════════════════════════════
// Stallon: Shopify Sync Service
//
// Two modes:
//   fullSync()  — products + inventory + orders + velocity (boot/manual)
//   salesPulse() — last 24h orders only (every 3 min)
//
// Returns structured data the frontend stores in localStorage.
// Deshawn's cash-flow reads from the same am_sales bucket.
// Shrek's MPs read from am_products after title matching.
// ═══════════════════════════════════════════════════════════════

import { ShopifyClient } from './client';
import { mapProduct, mapOrder, buildProductTree } from './mappers';
import { sinceDate, buildVelocity, buildSalesSummary } from './analytics';
import { normalizeLocation, buildStoreInventory } from './locations';
import type {
  AticaProduct, AticaOrder, AticaInventoryLocation,
  VelocityEntry, SalesSummary, ProductTree,
} from './types';

// ── Full sync result ──────────────────────────────────────────

export interface FullSyncResult {
  ok: boolean;
  reason?: string;
  products?: AticaProduct[];
  productTrees?: ProductTree[];
  inventory?: {
    locations: AticaInventoryLocation[];
    byStore: Record<string, Record<number, number>>;
  };
  orders?: AticaOrder[];
  velocity?: VelocityEntry[];
  sales?: SalesSummary;
  stats?: {
    productCount: number;
    orderCount: number;
    locationCount: number;
    syncedAt: string;
  };
}

export async function fullSync(client: ShopifyClient): Promise<FullSyncResult> {
  try {
    // Parallel fetch everything
    const [rawProducts, rawLocations, rawOrders90, rawOrders30] = await Promise.all([
      client.getProducts(),
      client.getLocations(),
      client.getOrders({ created_at_min: sinceDate(90) }),
      client.getOrders({ created_at_min: sinceDate(30) }),
    ]);

    // Map products
    const products = rawProducts.map(mapProduct);
    const productTrees = rawProducts.map(buildProductTree);

    // Map inventory with location normalization
    const inventoryLocations: AticaInventoryLocation[] = [];
    for (const loc of rawLocations) {
      const levels = await client.getInventoryLevels(loc.id);
      inventoryLocations.push({
        locationId: loc.id,
        locationName: normalizeLocation(loc.name),
        levels: levels.map(l => ({
          inventoryItemId: l.inventory_item_id,
          available: l.available,
          updatedAt: l.updated_at,
        })),
      });
    }
    const byStore = buildStoreInventory(inventoryLocations);

    // Map orders
    const orders = rawOrders90.map(mapOrder);

    // Build velocity & sales from 30d orders
    const velocity = buildVelocity(rawOrders30, 30);
    const sales = buildSalesSummary(rawOrders30, 30);

    return {
      ok: true,
      products,
      productTrees,
      inventory: { locations: inventoryLocations, byStore },
      orders,
      velocity,
      sales,
      stats: {
        productCount: products.length,
        orderCount: orders.length,
        locationCount: rawLocations.length,
        syncedAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return { ok: false, reason: err.message };
  }
}

// ── Sales pulse result ────────────────────────────────────────

export interface SalesPulseResult {
  ok: boolean;
  reason?: string;
  newOrders?: AticaOrder[];
  todayRevenue?: number;
  todayOrders?: number;
  total24h?: number;
  pulsedAt?: string;
}

export async function salesPulse(client: ShopifyClient): Promise<SalesPulseResult> {
  try {
    const since = sinceDate(1); // last 24h
    const [rawOrders, salesData] = await Promise.all([
      client.getOrders({ created_at_min: since }),
      (async () => {
        const todayOrders = await client.getOrders({ created_at_min: sinceDate(1) });
        return buildSalesSummary(todayOrders, 1);
      })(),
    ]);

    const orders = rawOrders.map(mapOrder);

    return {
      ok: true,
      newOrders: orders,
      todayRevenue: salesData.totalRevenue,
      todayOrders: salesData.totalOrders,
      total24h: orders.length,
      pulsedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return { ok: false, reason: err.message };
  }
}

// ── Inventory snapshot for a single product ───────────────────

export interface ProductInventorySnapshot {
  productId: number;
  title: string;
  stores: Record<string, { available: number; variants: { sku: string; size: string; available: number }[] }>;
  totalQty: number;
}

export async function getProductInventory(
  client: ShopifyClient,
  productId: number
): Promise<ProductInventorySnapshot> {
  const product = await client.getProduct(productId);
  const locations = await client.getLocations();

  const inventoryItemIds = product.variants.map(v => v.inventory_item_id);
  const skuMap: Record<number, { sku: string; size: string }> = {};
  for (const v of product.variants) {
    const parts = (v.title || '').split(' / ');
    const sizePart = parts.find(p => /^\d{2}/.test(p.trim()) || /^[SMLX]/i.test(p.trim())) || 'OS';
    skuMap[v.inventory_item_id] = { sku: v.sku, size: sizePart.trim() };
  }

  const stores: Record<string, { available: number; variants: { sku: string; size: string; available: number }[] }> = {};
  let totalQty = 0;

  for (const loc of locations) {
    const storeName = normalizeLocation(loc.name);
    const levels = await client.getInventoryLevels(loc.id);
    const relevant = levels.filter(l => inventoryItemIds.includes(l.inventory_item_id));

    if (!stores[storeName]) stores[storeName] = { available: 0, variants: [] };

    for (const lvl of relevant) {
      const info = skuMap[lvl.inventory_item_id] || { sku: '?', size: '?' };
      stores[storeName].available += lvl.available;
      stores[storeName].variants.push({
        sku: info.sku,
        size: info.size,
        available: lvl.available,
      });
      totalQty += lvl.available;
    }
  }

  return {
    productId: product.id,
    title: product.title,
    stores,
    totalQty,
  };
}
