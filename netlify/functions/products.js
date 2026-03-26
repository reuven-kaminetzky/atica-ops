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

const { fetchAllInventory, fetchInventoryFlat } = require('../../lib/inventory');

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

async function getPlmStatus() {
  const allStages = await store.plm.getAll();
  // Merge with seed data
  const statusMap = {};
  for (const entry of allStages) statusMap[entry.mpId || entry.key] = entry;

  const result = MP_SEEDS.map(seed => {
    const saved = statusMap[seed.id];
    return {
      mpId: seed.id,
      name: seed.name,
      code: seed.code,
      cat: seed.cat,
      plmStage: saved?.plmStage || 'In-Store',
      plmStageId: saved?.plmStageId || 16,
      updatedAt: saved?.updatedAt || null,
      updatedBy: saved?.updatedBy || null,
      history: saved?.history || [],
    };
  });

  return { count: result.length, stages: PLM_STAGES, products: result };
}

async function updatePlmStage(client, { pathParams, body }) {
  const mpId = decodeURIComponent(pathParams.id);
  const seed = MP_BY_ID[mpId];
  if (!seed) throw new RouteError(404, `MP not found: ${mpId}`);

  validate.required(body, ['plmStage']);
  const targetStage = PLM_STAGES.find(s => s.name === body.plmStage || s.id === body.plmStage);
  if (!targetStage) throw new RouteError(400, `Invalid PLM stage: ${body.plmStage}`);

  const existing = await store.plm.get(mpId) || {};
  const now = new Date().toISOString();

  const updated = {
    ...existing,
    mpId,
    plmStage: targetStage.name,
    plmStageId: targetStage.id,
    updatedAt: now,
    updatedBy: body.updatedBy || null,
    history: [...(existing.history || []), {
      from: existing.plmStage || 'In-Store',
      to: targetStage.name,
      at: now,
      by: body.updatedBy || null,
      notes: body.notes || null,
    }],
  };

  await store.plm.put(mpId, updated);
  return { updated: true, product: updated };
}

// ── Factory Package ─────────────────────────────────────────
// Generates everything a vendor needs to produce a product.
// Combines MP seed data + PLM artifacts + PO details.

// ── Product Stack Data ──────────────────────────────────────
// Persists per-MP specifications that populate factory packages.
// Fabric, construction, sizing charts, QC requirements, etc.
// This is the "tech pack data" layer.

async function getStackData(client, { pathParams }) {
  const mpId = decodeURIComponent(pathParams.id);
  const seed = MP_BY_ID[mpId];
  if (!seed) throw new RouteError(404, `MP not found: ${mpId}`);

  const data = await store.stack.get(mpId) || {};
  const plm = await store.plm.get(mpId) || {};

  return {
    mpId,
    name: seed.name,
    code: seed.code,
    cat: seed.cat,
    phase: plm.plmStage || 'In-Store',
    // Stack data sections — empty defaults for anything not yet filled
    materials: {
      fabricType: data.fabricType || '',
      fabricWeight: data.fabricWeight || '',
      fabricComp: data.fabricComp || '',
      fabricMill: data.fabricMill || '',
      colorways: data.colorways || [],
      washCare: data.washCare || '',
    },
    construction: {
      seams: data.seams || '',
      stitching: data.stitching || '',
      buttons: data.buttons || '',
      zippers: data.zippers || '',
      lining: data.lining || '',
      interlining: data.interlining || '',
      labels: data.labels || '',
      packaging: data.packaging || '',
    },
    sizing: {
      sizeChart: data.sizeChart || null,
      grading: data.grading || null,
      fitNotes: data.fitNotes || '',
      tolerances: data.tolerances || '',
      measurementPoints: data.measurementPoints || [],
    },
    quality: {
      aqlLevel: data.aqlLevel || '2.5',
      qcChecklist: data.qcChecklist || [],
      testReports: data.testReports || [],
      approvedSamples: data.approvedSamples || [],
    },
    logistics: {
      packingInstructions: data.packingInstructions || '',
      labelRequirements: data.labelRequirements || '',
      shippingMarks: data.shippingMarks || '',
      cartonSpecs: data.cartonSpecs || '',
    },
    compliance: {
      countryOfOrigin: data.countryOfOrigin || seed.country || '',
      careLabels: data.careLabels || '',
      hangTags: data.hangTags || '',
    },
    content: {
      description: data.description || '',
      tagline: data.tagline || '',
      features: data.features || seed.features || [],
      heroImage: data.heroImage || seed.heroImg || null,
      additionalImages: data.additionalImages || [],
    },
    updatedAt: data._updatedAt || null,
  };
}

async function updateStackData(client, { pathParams, body }) {
  const mpId = decodeURIComponent(pathParams.id);
  const seed = MP_BY_ID[mpId];
  if (!seed) throw new RouteError(404, `MP not found: ${mpId}`);

  const existing = await store.stack.get(mpId) || {};

  // Optimistic locking — if client sends _updatedAt, verify it matches
  if (body._updatedAt && existing._updatedAt && body._updatedAt !== existing._updatedAt) {
    throw new RouteError(409, 'Conflict: stack data was modified since you loaded it. Reload and try again.');
  }

  const updated = { ...existing };
  const allowed = [
    'fabricType', 'fabricWeight', 'fabricComp', 'fabricMill', 'colorways', 'washCare',
    'seams', 'stitching', 'buttons', 'zippers', 'lining', 'interlining', 'labels', 'packaging',
    'sizeChart', 'grading', 'fitNotes', 'tolerances', 'measurementPoints',
    'aqlLevel', 'qcChecklist', 'testReports', 'approvedSamples',
    'packingInstructions', 'labelRequirements', 'shippingMarks', 'cartonSpecs',
    'countryOfOrigin', 'careLabels', 'hangTags',
    'description', 'tagline', 'features', 'heroImage', 'additionalImages',
  ];

  // Track what changed for audit trail
  const changes = [];
  for (const key of allowed) {
    if (body[key] !== undefined && JSON.stringify(body[key]) !== JSON.stringify(existing[key])) {
      changes.push({ field: key, from: existing[key] || null, to: body[key] });
      updated[key] = body[key];
    }
  }

  if (changes.length === 0) {
    return { updated: false, mpId, message: 'No changes detected' };
  }

  // Audit trail
  updated.mpId = mpId;
  updated.history = [...(existing.history || []), {
    at: new Date().toISOString(),
    by: body.updatedBy || null,
    changes,
  }];

  await store.stack.put(mpId, updated);

  // Compute completeness
  let filled = 0;
  for (const key of allowed) {
    const val = updated[key];
    if (val && val !== '' && !(Array.isArray(val) && val.length === 0)) filled++;
  }

  return {
    updated: true,
    mpId,
    changesCount: changes.length,
    completeness: Math.round((filled / allowed.length) * 100),
    updatedAt: updated._updatedAt,
  };
}

// ── Factory Package (enhanced with stack data) ──────────────

const { FACTORY_PACKAGE_SECTIONS, MP_STATUS_RULES } = require('../../lib/domain');

async function factoryPackage(client, { pathParams }) {
  const mpId = decodeURIComponent(pathParams.id);
  const seed = MP_BY_ID[mpId];
  if (!seed) throw new RouteError(404, `MP not found: ${mpId}`);

  // Get PLM + stack data + POs in parallel
  const [plm, stackData, allPOs] = await Promise.all([
    store.plm.get(mpId).catch(() => ({})),
    store.stack.get(mpId).catch(() => ({})),
    store.po.getAll().catch(() => []),
  ]);

  const pos = allPOs.filter(po => po.mpId === mpId);
  const latestPO = pos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
  const sd = stackData || {};

  const pkg = {
    generatedAt: new Date().toISOString(),
    mpId: seed.id,
    productIdentity: {
      name: seed.name,
      code: seed.code,
      category: seed.cat,
      vendor: seed.vendor,
      description: sd.description || '',
      tagline: sd.tagline || '',
      features: sd.features || seed.features || [],
      heroImg: sd.heroImage || seed.heroImg || null,
    },
    techSpecs: {
      fits: seed.fits || [],
      sizes: seed.sizes || null,
      construction: sd.construction || '',
    },
    materials: {
      fabricType: sd.fabricType || '',
      fabricWeight: sd.fabricWeight || '',
      fabricComp: sd.fabricComp || '',
      fabricMill: sd.fabricMill || '',
      colorways: sd.colorways || [],
      washCare: sd.washCare || '',
      lining: sd.lining || '',
      buttons: sd.buttons || '',
      labels: sd.labels || '',
      packaging: sd.packaging || '',
    },
    costing: {
      fob: seed.fob,
      retail: seed.retail,
      duty: seed.duty || 0,
      hts: seed.hts || null,
      landedCost: +(seed.fob * (1 + (seed.duty || 0) / 100 + 0.08)).toFixed(2),
      margin: seed.retail > 0 ? +((1 - seed.fob * 1.34 / seed.retail) * 100).toFixed(1) : null,
      moq: seed.moq || null,
      lead: seed.lead || null,
    },
    sizing: {
      sizeChart: sd.sizeChart || null,
      grading: sd.grading || null,
      fitNotes: sd.fitNotes || '',
      tolerances: sd.tolerances || '',
    },
    quality: {
      aqlLevel: sd.aqlLevel || '2.5',
      qcChecklist: sd.qcChecklist || [],
    },
    shipping: latestPO ? {
      etd: latestPO.etd || null,
      container: latestPO.container || null,
      packingInstructions: sd.packingInstructions || '',
    } : { etd: null, container: null, packingInstructions: sd.packingInstructions || '' },
    compliance: {
      countryOfOrigin: sd.countryOfOrigin || seed.country || '',
      careLabels: sd.careLabels || '',
      hangTags: sd.hangTags || '',
    },
    plmStatus: {
      currentStage: (plm || {}).plmStage || 'Concept',
      stageId: (plm || {}).plmStageId || 1,
    },
    activePOs: pos.map(po => ({
      id: po.id, stage: po.stage, units: po.units || 0,
      fobTotal: po.fobTotal || 0, etd: po.etd || null,
    })),
    sections: FACTORY_PACKAGE_SECTIONS.map(s => s.label),
  };

  // Compute completeness — how much of the tech pack is filled
  const checkFields = [
    sd.fabricType, sd.fabricWeight, sd.fabricComp, sd.fabricMill,
    sd.sizeChart, sd.grading, sd.fitNotes,
    sd.description, sd.countryOfOrigin,
    seed.fob, seed.hts, seed.fits, seed.sizes,
    latestPO?.etd, latestPO?.styles,
  ];
  const filled = checkFields.filter(v => v && v !== '' && !(Array.isArray(v) && v.length === 0)).length;
  pkg.completeness = Math.round((filled / checkFields.length) * 100);

  return { package: pkg };
}

// ── MP Status (derived) ─────────────────────────────────────

async function mpStatus(client, { params }) {
  const days = validate.days(params);

  // Fetch all data sources
  const [productsData, ordersData] = await Promise.all([
    client.getProducts(),
    client.getOrders({ created_at_min: sinceDate(days) }),
  ]);

  const { matched } = matchAll(productsData.products);

  // Build velocity by MP
  const productIdToMP = {};
  for (const [seedId, shopifyProducts] of Object.entries(matched)) {
    for (const sp of shopifyProducts) productIdToMP[sp.id] = seedId;
  }
  const mpVelocity = {};
  for (const order of ordersData.orders) {
    for (const li of order.line_items) {
      const mpId = productIdToMP[li.product_id];
      if (!mpId) continue;
      if (!mpVelocity[mpId]) mpVelocity[mpId] = 0;
      mpVelocity[mpId] += li.quantity;
    }
  }

  // Get PLM + PO data
  let plmData = [], poData = [];
  plmData = await store.plm.getAll();
  poData = await store.po.getAll();

  const plmByMP = {};
  for (const p of plmData) plmByMP[p.mpId || p.key] = p;
  const posByMP = {};
  for (const po of poData) {
    if (!po.mpId) continue;
    if (!posByMP[po.mpId]) posByMP[po.mpId] = [];
    posByMP[po.mpId].push(po);
  }

  const statuses = MP_SEEDS.map(seed => {
    const plm = plmByMP[seed.id] || {};
    const pos = posByMP[seed.id] || [];
    const activePOs = pos.filter(po => !['Received', 'Distribution'].includes(po.stage));
    const unitsSold = mpVelocity[seed.id] || 0;

    // Compute inventory (simplified — uses matched product variant totals)
    let totalInventory = 0;
    const matchedProducts = matched[seed.id] || [];
    for (const sp of matchedProducts) {
      for (const v of sp.variants) totalInventory += (v.inventory_quantity || 0);
    }

    const unitsPerDay = unitsSold / days;
    const daysOfStock = unitsPerDay > 0 ? Math.round(totalInventory / unitsPerDay) : totalInventory > 0 ? 999 : 0;

    const mpData = {
      plmStage: plm.plmStageId || (totalInventory > 0 ? 12 : 1),
      activePOs: activePOs.length,
      totalInventory,
      daysOfStock,
      unitsSold,
    };

    return {
      mpId: seed.id,
      name: seed.name,
      code: seed.code,
      cat: seed.cat,
      vendor: seed.vendor,
      status: MP_STATUS_RULES.compute(mpData),
      plmStage: plm.plmStage || (totalInventory > 0 ? 'In-Store' : 'Concept'),
      activePOs: activePOs.length,
      totalInventory,
      daysOfStock: Math.min(daysOfStock, 999),
      unitsSold,
    };
  });

  // Count by status
  const counts = {};
  for (const s of statuses) counts[s.status] = (counts[s.status] || 0) + 1;

  return { days, counts, products: statuses };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',   path: '',                   handler: listProducts },
  { method: 'POST',  path: 'sync',               handler: syncProducts },
  { method: 'GET',   path: 'titles',             handler: listTitles },
  { method: 'GET',   path: 'trees',              handler: productTrees },
  { method: 'GET',   path: 'masters',            handler: masterProducts },
  { method: 'GET',   path: 'seeds',              handler: seedCatalog,       noClient: true },
  { method: 'GET',   path: 'reorder',            handler: reorderPlan },
  { method: 'GET',   path: 'stock',              handler: stockByLocation },
  { method: 'GET',   path: 'status',             handler: mpStatus },
  { method: 'GET',   path: 'plm',                handler: getPlmStatus,      noClient: true },
  { method: 'PATCH', path: 'plm/:id',            handler: updatePlmStage,    noClient: true },
  { method: 'GET',   path: 'stack/:id',          handler: getStackData,      noClient: true },
  { method: 'PATCH', path: 'stack/:id',          handler: updateStackData,   noClient: true },
  { method: 'GET',   path: 'factory-package/:id', handler: factoryPackage,   noClient: true },
  { method: 'GET',   path: 'sku-map',            handler: skuMap },
  { method: 'PATCH', path: 'sku-map/:sku',       handler: updateSKU,         noClient: true },
  { method: 'POST',  path: 'sku-map/confirm-all', handler: confirmAllSKU,    noClient: true },
];

exports.handler = createHandler(ROUTES, 'products');
