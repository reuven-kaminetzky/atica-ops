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

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: '',                handler: listProducts },
  { method: 'POST',  path: 'sync',            handler: syncProducts },
  { method: 'GET',   path: 'titles',          handler: listTitles },
  { method: 'GET',   path: 'trees',           handler: productTrees },
  { method: 'GET',   path: 'masters',         handler: masterProducts },
  { method: 'GET',   path: 'seeds',           handler: seedCatalog,    noClient: true },
  { method: 'GET',   path: 'sku-map',         handler: skuMap },
  { method: 'PATCH', path: 'sku-map/:sku',    handler: updateSKU,      noClient: true },
  { method: 'POST',  path: 'sku-map/confirm-all', handler: confirmAllSKU, noClient: true },
];

exports.handler = createHandler(ROUTES, 'products');
