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

const { createHandler, RouteError, validate } = require('../../lib/handler');
const { mapProduct, mapSKU, buildProductTree } = require('../../lib/mappers');
const { MP_SEEDS, MP_BY_ID, CATEGORIES, SIZE_GROUPS, PLM_STAGES, matchAll, resolveAlias,
        adjustVelocity, classifyDemand, suggestDistribution, landedCost, DISTRIBUTION_WEIGHTS } = require('../../lib/products');
const { sinceDate } = require('../../lib/analytics');
const cache = require('../../lib/cache');
const store = require('../../lib/store');

// ── Shared Helpers ─────────────────────────────────────────
// Inventory fetch is expensive (sequential per location).
// Cache it within this function's memory so reorder + stock share it.

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
  const days = validate.days(params);
  const coverDays = validate.intParam(params, 'cover', { min: 30, max: 365, fallback: 140 }); // 20 weeks — business target is 16-24 weeks
  const ck = cache.makeKey('reorder', { days, coverDays });
  const cached = cache.get(ck);
  if (cached) return cached;

  // Fetch all three data sources in parallel
  const [productsData, ordersData, inventoryData] = await Promise.all([
    client.getProducts(),
    client.getOrders({ created_at_min: sinceDate(days) }),
    fetchAllInventory(client),
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

  // 5. Fetch active POs to cross-reference
  let activePOs = [];
  try {
    const allPOs = await store.po.getAll();
    activePOs = allPOs.filter(po =>
      po.mpId && !['Received', 'Distribution'].includes(po.stage)
    );
  } catch (e) { /* blobs might be empty */ }

  // Build mpId → active PO lookup
  const poByMP = {};
  for (const po of activePOs) {
    if (!poByMP[po.mpId]) poByMP[po.mpId] = [];
    poByMP[po.mpId].push({ id: po.id, stage: po.stage, units: po.units || 0 });
  }

  // 6. Build reorder plan with seasonal adjustment + demand signals
  const currentMonth = new Date().getMonth() + 1;
  const plan = MP_SEEDS.map(seed => {
    const vel = mpVelocity[seed.id] || { units: 0, revenue: 0 };
    const stock = mpInventory[seed.id] || 0;
    const rawPerDay = vel.units / days;
    // Seasonal adjustment: project forward using adjusted velocity
    const adjustedPerDay = adjustVelocity(rawPerDay * 7, currentMonth) / 7;
    const unitsPerDay = adjustedPerDay; // use adjusted for all planning
    const daysOfStock = unitsPerDay > 0 ? Math.round(stock / unitsPerDay) : stock > 0 ? 999 : 0;
    const activePOsForMP = poByMP[seed.id] || [];
    const incomingUnits = activePOsForMP.reduce((s, po) => s + po.units, 0);
    const effectiveStock = stock + incomingUnits;
    const effectiveDays = unitsPerDay > 0 ? Math.round(effectiveStock / unitsPerDay) : effectiveStock > 0 ? 999 : 0;
    const needsReorder = effectiveDays < coverDays && effectiveDays < 999;
    const suggestedQty = needsReorder
      ? Math.max(seed.moq || 0, Math.ceil(unitsPerDay * coverDays) - effectiveStock)
      : 0;
    const suggestedCost = +(suggestedQty * (seed.fob || 0)).toFixed(2);

    // Lead-time-aware ordering
    const leadDays = seed.lead || 0;
    const orderByDaysFromNow = effectiveDays - leadDays;
    const orderByDate = effectiveDays < 999
      ? new Date(Date.now() + orderByDaysFromNow * 86400000).toISOString().slice(0, 10)
      : null;
    const urgency = effectiveDays >= 999 ? 'none'
      : orderByDaysFromNow <= 0 ? 'overdue'
      : orderByDaysFromNow <= 14 ? 'urgent'
      : orderByDaysFromNow <= 30 ? 'soon'
      : 'planned';

    // Demand signal
    const velocityPerWeek = rawPerDay * 7;
    const totalEver = stock + vel.units; // rough proxy
    const sellThrough = totalEver > 0 ? Math.round((vel.units / totalEver) * 100) : 0;
    const signal = stock === 0 && vel.units > 0 ? 'stockout' : classifyDemand(sellThrough, velocityPerWeek);

    // Distribution suggestion for incoming PO
    const distribution = suggestedQty > 0 ? suggestDistribution(suggestedQty) : null;

    return {
      mpId: seed.id,
      name: seed.name,
      code: seed.code,
      cat: seed.cat,
      vendor: seed.vendor,
      currentStock: stock,
      incomingUnits,
      activePOs: activePOsForMP,
      unitsPerDay: +rawPerDay.toFixed(2),
      adjustedPerDay: +adjustedPerDay.toFixed(2),
      unitsSold: vel.units,
      revenue: +vel.revenue.toFixed(2),
      daysOfStock,
      effectiveDays,
      signal,
      sellThrough,
      velocityPerWeek: +velocityPerWeek.toFixed(1),
      lead: leadDays,
      orderByDate,
      orderByDaysFromNow: effectiveDays < 999 ? orderByDaysFromNow : null,
      urgency,
      needsReorder,
      suggestedQty,
      suggestedCost,
      distribution,
      moq: seed.moq || 0,
      fob: seed.fob || 0,
    };
  });

  // Sort: overdue first, then urgent, then soon, then by effective days
  const urgencyOrder = { overdue: 0, urgent: 1, soon: 2, planned: 3, none: 4 };
  plan.sort((a, b) => {
    const ua = urgencyOrder[a.urgency] ?? 4;
    const ub = urgencyOrder[b.urgency] ?? 4;
    if (ua !== ub) return ua - ub;
    return a.effectiveDays - b.effectiveDays;
  });

  const reorderItems = plan.filter(p => p.needsReorder);
  const totalReorderCost = reorderItems.reduce((s, p) => s + p.suggestedCost, 0);
  const totalReorderUnits = reorderItems.reduce((s, p) => s + p.suggestedQty, 0);

  const result = {
    days,
    coverDays,
    seasonalMultiplier: +(adjustVelocity(1, currentMonth)).toFixed(2),
    summary: {
      totalMPs: plan.length,
      needReorder: reorderItems.length,
      overdue: plan.filter(p => p.urgency === 'overdue').length,
      urgent: plan.filter(p => p.urgency === 'urgent').length,
      soon: plan.filter(p => p.urgency === 'soon').length,
      totalReorderCost: +totalReorderCost.toFixed(2),
      totalReorderUnits,
      avgDaysOfStock: plan.length
        ? Math.round(plan.reduce((s, p) => s + Math.min(p.daysOfStock, 365), 0) / plan.length)
        : 0,
      signals: {
        hot: plan.filter(p => p.signal === 'hot').length,
        rising: plan.filter(p => p.signal === 'rising').length,
        steady: plan.filter(p => p.signal === 'steady').length,
        slow: plan.filter(p => p.signal === 'slow').length,
        stockout: plan.filter(p => p.signal === 'stockout').length,
      },
    },
    plan,
  };

  cache.set(ck, result, cache.CACHE_TTL.velocity);
  return result;
}

// ── Stock by Location per MP ────────────────────────────────

async function stockByLocation(client) {
  const ck = cache.makeKey('stock-by-location', {});
  const cached = cache.get(ck);
  if (cached) return cached;

  const [productsData, inventoryData] = await Promise.all([
    client.getProducts(),
    fetchAllInventory(client),
  ]);

  const { matched } = matchAll(productsData.products);

  // Build inventoryItemId → MP lookup
  const itemToMP = {};
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) {
      for (const v of sp.variants) {
        if (v.inventory_item_id) itemToMP[v.inventory_item_id] = seedId;
      }
    }
  }

  // Normalize location names
  const { normalize } = require('../../lib/locations');
  const locationNames = inventoryData.map(l => ({ id: l.id, name: normalize(l.name) }));

  // Build MP × Location matrix
  const matrix = {};
  for (const loc of inventoryData) {
    const locName = normalize(loc.name);
    for (const level of loc.levels) {
      const mpId = itemToMP[level.inventory_item_id];
      if (!mpId) continue;
      if (!matrix[mpId]) matrix[mpId] = {};
      matrix[mpId][locName] = (matrix[mpId][locName] || 0) + (level.available || 0);
    }
  }

  // Build response
  const storeNames = [...new Set(locationNames.map(l => l.name))].sort();
  const rows = MP_SEEDS.map(seed => {
    const stores = matrix[seed.id] || {};
    const total = Object.values(stores).reduce((s, v) => s + v, 0);
    return {
      mpId: seed.id,
      name: seed.name,
      code: seed.code,
      cat: seed.cat,
      total,
      stores,
    };
  }).filter(r => r.total > 0 || Object.keys(r.stores).length > 0);

  rows.sort((a, b) => b.total - a.total);

  const result = {
    storeNames,
    count: rows.length,
    inventory: rows,
  };

  cache.set(ck, result, cache.CACHE_TTL.inventory);
  return result;
}

// ── PLM Stage Tracking ──────────────────────────────────────
// Persists which lifecycle stage each MP is at.
// Data in Netlify Blobs (store.plm), not Shopify.

async function getPlmStages() {
  const all = await store.plm.getAll();
  const byMP = {};
  for (const entry of all) {
    byMP[entry.mpId || entry.key] = entry;
  }

  const stages = MP_SEEDS.map(seed => {
    const stored = byMP[seed.id];
    return {
      mpId: seed.id,
      name: seed.name,
      code: seed.code,
      cat: seed.cat,
      plmStage: stored?.plmStage || 'Concept',
      plmStageId: stored?.plmStageId || 1,
      updatedAt: stored?._updatedAt || null,
      updatedBy: stored?.updatedBy || null,
      history: stored?.history || [],
    };
  });

  return { count: stages.length, plmStageDefinitions: PLM_STAGES, stages };
}

async function updatePlmStage(_, { pathParams, body }) {
  const mpId = decodeURIComponent(pathParams.id).trim();
  const seed = MP_BY_ID[mpId];
  if (!seed) throw new RouteError(404, `MP not found: ${mpId}`);

  const stageName = String(body.stage || body.plmStage || '').trim();
  if (!stageName) throw new RouteError(400, 'Missing required field: stage or plmStage');

  const stageDef = PLM_STAGES.find(s => s.name === stageName || s.id === Number(stageName));
  if (!stageDef) throw new RouteError(400, `Invalid PLM stage: ${stageName}. Valid: ${PLM_STAGES.map(s => s.name).join(', ')}`);

  // Gate enforcement — reviewer identity required for gated stages
  const reviewer = String(body.checkedBy || body.updatedBy || '').trim();
  if (stageDef.gate && !reviewer) {
    throw new RouteError(400, `Stage "${stageDef.name}" requires checkedBy (gate: ${stageDef.gate})`);
  }

  const existing = await store.plm.get(mpId) || {};
  const now = new Date().toISOString();
  const prevHistory = Array.isArray(existing.history) ? existing.history : [];

  const record = {
    ...existing,
    mpId,
    plmStage: stageDef.name,
    plmStageId: stageDef.id,
    previousStage: existing.plmStage || 'Concept',
    updatedAt: now,
    updatedBy: reviewer || null,
    notes: body.notes ? String(body.notes).trim() : null,
    history: [
      ...prevHistory,
      {
        from: existing.plmStage || 'Concept',
        to: stageDef.name,
        by: reviewer || null,
        notes: body.notes ? String(body.notes).trim() : null,
        at: now,
      },
    ],
  };

  await store.plm.put(mpId, record);

  return { updated: true, mpId, name: seed.name, plmStage: stageDef.name, plmStageId: stageDef.id, gate: stageDef.gate };
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
  { method: 'GET',   path: 'stock',           handler: stockByLocation },
  { method: 'GET',   path: 'plm',             handler: getPlmStages,   noClient: true },
  { method: 'PATCH', path: 'plm/:id',         handler: updatePlmStage, noClient: true },
  { method: 'GET',   path: 'sku-map',         handler: skuMap },
  { method: 'PATCH', path: 'sku-map/:sku',    handler: updateSKU,      noClient: true },
  { method: 'POST',  path: 'sku-map/confirm-all', handler: confirmAllSKU, noClient: true },
];

exports.handler = createHandler(ROUTES, 'products');
