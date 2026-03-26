/**
 * /api/products/* — Product data from Shopify + Master Products
 * Owner: Stallon (API layer)
 * 
 * Routes:
 *   GET  /api/products              → list all Shopify products (cached)
 *   POST /api/products/sync         → force sync from Shopify
 *   GET  /api/products/titles       → just titles (lightweight)
 *   GET  /api/products/trees        → product tree (Style→Fit→Size)
 *   GET  /api/products/masters      → MPs matched with Shopify data
 *   GET  /api/products/seeds        → MP seed catalog (no Shopify data)
 *   GET  /api/products/sku-map      → SKU mapping table
 *   PATCH /api/products/sku-map/:sku → update single SKU
 *   POST /api/products/sku-map/confirm-all → confirm all
 */

const { createHandler, RouteError } = require('../../lib/handler');
const { mapProduct, mapSKU, buildProductTree } = require('../../lib/mappers');
const { MP_SEEDS, MP_BY_ID, CATEGORIES, SIZE_GROUPS, PLM_STAGES, matchAll, resolveAlias } = require('../../lib/products');
const { sinceDate } = require('../../lib/analytics');
const cache = require('../../lib/cache');

// ── Handlers ────────────────────────────────────────────────

async function listProducts(client) {
  const ck = cache.makeKey('products', {});
  const cached = cache.get(ck);
  if (cached) return { ...cached, _cached: true };

  const { products } = await client.getProducts();
  const result = { count: products.length, products: products.map(mapProduct) };
  cache.set(ck, result, cache.CACHE_TTL.products);
  return result;
}

async function syncProducts(client) {
  // Clear cache and force fresh fetch
  const ck = cache.makeKey('products', {});
  cache.set(ck, null, 0); // invalidate
  const { products } = await client.getProducts();
  const result = { count: products.length, products: products.map(mapProduct) };
  cache.set(ck, result, cache.CACHE_TTL.products);
  return result;
}

async function listTitles(client) {
  const ck = cache.makeKey('titles', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const { products } = await client.getProducts();
  const result = {
    count: products.length,
    titles: products.map(p => ({
      title: p.title,
      productType: p.product_type,
      status: p.status,
      variants: p.variants.length,
      price: p.variants[0]?.price || '0',
    })).sort((a, b) => a.title.localeCompare(b.title)),
  };
  cache.set(ck, result, cache.CACHE_TTL.titles);
  return result;
}

async function skuMap(client, { params }) {
  const ck = cache.makeKey('sku-map', { filter: params.filter });
  const cached = cache.get(ck);
  if (cached) return cached;

  const { products } = await client.getProducts();
  const map = products.flatMap(p => p.variants.map(v => mapSKU(p, v)));
  const filter = params.filter;
  const filtered = filter && filter !== 'all'
    ? map.filter(s => s.sku.toLowerCase().includes(filter.toLowerCase()))
    : map;
  const result = { count: filtered.length, skuMap: filtered };
  cache.set(ck, result, cache.CACHE_TTL['sku-map']);
  return result;
}

async function updateSKU(client, { pathParams, body }) {
  const sku = decodeURIComponent(pathParams.sku);
  return { sku, ...body, updated: true };
}

async function confirmAllSKU() {
  return { confirmed: true, message: 'All SKU mappings confirmed' };
}

async function productTrees(client) {
  const ck = cache.makeKey('product-trees', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const { products } = await client.getProducts();
  const trees = products.map(buildProductTree);
  const result = { count: trees.length, trees };
  cache.set(ck, result, cache.CACHE_TTL.products);
  return result;
}

// ── Master Products — the PLM backbone ──────────────────────

async function masterProducts(client, { params }) {
  const ck = cache.makeKey('masters', { cat: params.cat });
  const cached = cache.get(ck);
  if (cached) return { ...cached, _cached: true };

  const { products } = await client.getProducts();
  const { matched, unmatched } = matchAll(products);

  // Build enriched MP records
  const masters = MP_SEEDS.map(seed => {
    const shopifyProducts = matched[seed.id] || [];
    const trees = shopifyProducts.map(buildProductTree);
    const allVariants = shopifyProducts.flatMap(p => p.variants || []);

    // Aggregate from Shopify
    const totalInventory = allVariants.reduce((s, v) => s + (v.inventory_quantity || 0), 0);
    const prices = allVariants.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
    const images = shopifyProducts.flatMap(p => (p.images || []).map(i => i.src)).slice(0, 8);
    const styles = trees.flatMap(t => t.styles || []);

    return {
      ...seed,
      // Live Shopify data
      shopifyProductCount: shopifyProducts.length,
      shopifyProductIds: shopifyProducts.map(p => p.id),
      totalInventory,
      liveRetail: prices.length ? Math.max(...prices) : seed.retail,
      images,
      styles: styles.map(s => ({
        name: s.name,
        color: s.color,
        qty: s.totalQty,
        fits: s.fits.map(f => ({ name: f.name, qty: f.totalQty, sizes: f.sizes })),
      })),
      styleCount: styles.length,
      variantCount: allVariants.length,
      // Computed
      landedCost: +(seed.fob * (1 + (seed.duty || 0) / 100)).toFixed(2),
      margin: prices.length
        ? +((1 - seed.fob / Math.max(...prices)) * 100).toFixed(1)
        : null,
    };
  });

  // Filter by category if requested
  let filtered = masters;
  if (params.cat) {
    filtered = masters.filter(m => m.cat.toLowerCase() === params.cat.toLowerCase());
  }

  const result = {
    totalMPs: MP_SEEDS.length,
    matchedMPs: Object.keys(matched).length,
    unmatchedShopify: unmatched.length,
    categories: CATEGORIES,
    masters: filtered,
    unmatched: unmatched.map(p => ({ id: p.id, title: p.title, type: p.product_type })),
  };
  cache.set(ck, result, cache.CACHE_TTL.products);
  return result;
}

async function seedCatalog() {
  return {
    count: MP_SEEDS.length,
    categories: CATEGORIES,
    sizeGroups: SIZE_GROUPS,
    plmStages: PLM_STAGES,
    seeds: MP_SEEDS,
  };
}

// ── Production Planning — what to reorder ───────────────────

async function reorderPlan(client, { params }) {
  const days = Math.min(parseInt(params.days || '30', 10), 365);
  const coverDays = parseInt(params.cover || '90', 10); // target days of stock to maintain
  const ck = cache.makeKey('reorder', { days, coverDays });
  const cached = cache.get(ck);
  if (cached) return cached;

  // Fetch all three data sources in parallel
  const [productsData, ordersData, inventoryData] = await Promise.all([
    client.getProducts(),
    client.getOrders({ created_at_min: sinceDate(days) }),
    (async () => {
      const { locations } = await client.getLocations();
      const result = [];
      for (const loc of locations) {
        const { inventory_levels } = await client.getInventoryLevels(loc.id);
        result.push({ id: loc.id, name: loc.name, levels: inventory_levels });
      }
      return result;
    })(),
  ]);

  const products = productsData.products;
  const orders = ordersData.orders;

  // 1. Match products to MPs
  const { matched } = matchAll(products);

  // 2. Build product_id → MP lookup
  const productIdToMP = {};
  const mpInventoryItemIds = {}; // mpId → [inventoryItemId, ...]
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) {
      productIdToMP[sp.id] = seedId;
      if (!mpInventoryItemIds[seedId]) mpInventoryItemIds[seedId] = [];
      for (const v of sp.variants) {
        if (v.inventory_item_id) mpInventoryItemIds[seedId].push(v.inventory_item_id);
      }
    }
  }

  // 3. Compute velocity by MP from orders
  const mpVelocity = {};
  for (const order of orders) {
    for (const li of order.line_items) {
      const mpId = productIdToMP[li.product_id];
      if (!mpId) continue;
      if (!mpVelocity[mpId]) mpVelocity[mpId] = { units: 0, revenue: 0 };
      mpVelocity[mpId].units += li.quantity;
      mpVelocity[mpId].revenue += parseFloat(li.price) * li.quantity;
    }
  }

  // 4. Compute inventory by MP from all locations
  const allLevels = {};
  for (const loc of inventoryData) {
    for (const level of loc.levels) {
      allLevels[level.inventory_item_id] = (allLevels[level.inventory_item_id] || 0) + (level.available || 0);
    }
  }

  const mpInventory = {};
  for (const [mpId, itemIds] of Object.entries(mpInventoryItemIds)) {
    mpInventory[mpId] = itemIds.reduce((s, id) => s + (allLevels[id] || 0), 0);
  }

  // 5. Build reorder plan
  const plan = MP_SEEDS.map(seed => {
    const vel = mpVelocity[seed.id] || { units: 0, revenue: 0 };
    const stock = mpInventory[seed.id] || 0;
    const unitsPerDay = vel.units / days;
    const daysOfStock = unitsPerDay > 0 ? Math.round(stock / unitsPerDay) : stock > 0 ? 999 : 0;
    const needsReorder = daysOfStock < coverDays && daysOfStock < 999;
    const suggestedQty = needsReorder
      ? Math.max(seed.moq || 0, Math.ceil(unitsPerDay * coverDays) - stock)
      : 0;
    const suggestedCost = +(suggestedQty * (seed.fob || 0)).toFixed(2);

    return {
      mpId: seed.id,
      name: seed.name,
      code: seed.code,
      cat: seed.cat,
      vendor: seed.vendor,
      // Current state
      currentStock: stock,
      unitsPerDay: +unitsPerDay.toFixed(2),
      unitsSold: vel.units,
      revenue: +vel.revenue.toFixed(2),
      daysOfStock,
      // Reorder signal
      needsReorder,
      suggestedQty,
      suggestedCost,
      moq: seed.moq || 0,
      lead: seed.lead || 0,
      fob: seed.fob || 0,
    };
  });

  // Sort: needs reorder first, then by days of stock ascending
  plan.sort((a, b) => {
    if (a.needsReorder !== b.needsReorder) return a.needsReorder ? -1 : 1;
    return a.daysOfStock - b.daysOfStock;
  });

  const reorderItems = plan.filter(p => p.needsReorder);
  const totalReorderCost = reorderItems.reduce((s, p) => s + p.suggestedCost, 0);
  const totalReorderUnits = reorderItems.reduce((s, p) => s + p.suggestedQty, 0);

  const result = {
    days,
    coverDays,
    summary: {
      totalMPs: plan.length,
      needReorder: reorderItems.length,
      totalReorderCost: +totalReorderCost.toFixed(2),
      totalReorderUnits,
      avgDaysOfStock: plan.length
        ? Math.round(plan.reduce((s, p) => s + Math.min(p.daysOfStock, 365), 0) / plan.length)
        : 0,
    },
    plan,
  };

  cache.set(ck, result, cache.CACHE_TTL.velocity);
  return result;
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: '',                handler: listProducts },
  { method: 'POST',  path: 'sync',            handler: syncProducts },
  { method: 'GET',   path: 'titles',          handler: listTitles },
  { method: 'GET',   path: 'trees',           handler: productTrees },
  { method: 'GET',   path: 'masters',         handler: masterProducts },
  { method: 'GET',   path: 'seeds',           handler: seedCatalog,    noClient: true },
  { method: 'GET',   path: 'reorder',         handler: reorderPlan },
  { method: 'GET',   path: 'sku-map',         handler: skuMap },
  { method: 'PATCH', path: 'sku-map/:sku',    handler: updateSKU,      noClient: true },
  { method: 'POST',  path: 'sku-map/confirm-all', handler: confirmAllSKU, noClient: true },
];

exports.handler = createHandler(ROUTES, 'products');
