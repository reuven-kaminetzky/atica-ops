#!/usr/bin/env npx tsx
// ═══════════════════════════════════════════════════════════════
// Stallon: Shopify integration test
// Run: npx tsx scripts/test-shopify.ts
// ═══════════════════════════════════════════════════════════════

import { ShopifyClient } from '../lib/shopify/client';
import { mapProduct, buildProductTree } from '../lib/shopify/mappers';
import { buildVelocity, buildSalesSummary, sinceDate } from '../lib/shopify/analytics';
import { normalizeLocation } from '../lib/shopify/locations';

const STORE = process.env.SHOPIFY_STORE_URL || 'aticaman.myshopify.com';
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';

if (!TOKEN) {
  console.error('❌ Set SHOPIFY_ACCESS_TOKEN in .env.local');
  process.exit(1);
}

const client = new ShopifyClient({ shop: STORE, accessToken: TOKEN });
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string, err?: any) => console.error(`  ✗ ${msg}`, err?.message || '');

async function run() {
  console.log('\n═══ Stallon: Shopify Integration Test ═══\n');

  // 1. Connection
  console.log('1. Connection');
  try {
    const shop = await client.getShop();
    ok(`Connected to ${shop.name} (${shop.domain}) — ${shop.plan_name}`);
  } catch (e) {
    fail('Connection failed', e);
    process.exit(1);
  }

  // 2. Products
  console.log('\n2. Products');
  const products = await client.getProducts();
  ok(`${products.length} products fetched`);

  const mapped = products.map(mapProduct);
  ok(`${mapped.length} products mapped to Atica format`);

  // 3. Product Trees
  console.log('\n3. Product Trees (MP → Style → Fit → Size)');
  const trees = products.map(buildProductTree);
  let totalStyles = 0, totalFits = 0;
  for (const tree of trees) {
    totalStyles += tree.styles.length;
    for (const style of tree.styles) totalFits += style.fits.length;
  }
  ok(`${trees.length} trees built — ${totalStyles} styles, ${totalFits} fit nodes`);

  // Show a sample tree
  const sample = trees.find(t => t.styles.length > 1) || trees[0];
  if (sample) {
    console.log(`\n  Sample: ${sample.title}`);
    console.log(`  Options: ${sample.optionNames.join(' → ')}`);
    for (const style of sample.styles.slice(0, 3)) {
      console.log(`    Style: ${style.name} (${style.totalQty} units, $${style.price})`);
      for (const fit of style.fits) {
        console.log(`      Fit: ${fit.name} — sizes: ${fit.sizes.join(', ')} (${fit.totalQty}u)`);
      }
    }
    if (sample.styles.length > 3) console.log(`    ... +${sample.styles.length - 3} more styles`);
  }

  // 4. Inventory
  console.log('\n4. Inventory Locations');
  const locations = await client.getLocations();
  ok(`${locations.length} locations`);
  for (const loc of locations) {
    const normalized = normalizeLocation(loc.name);
    const marker = normalized !== loc.name ? ` → ${normalized}` : '';
    console.log(`    ${loc.name}${marker} (${loc.active ? 'active' : 'inactive'})`);
  }

  // 5. Orders
  console.log('\n5. Recent Orders (30d)');
  const orders = await client.getOrders({ created_at_min: sinceDate(30) });
  ok(`${orders.length} orders in last 30 days`);

  if (orders.length > 0) {
    const sales = buildSalesSummary(orders, 30);
    ok(`Revenue: $${sales.totalRevenue.toLocaleString()} — ${sales.totalUnits} units — AOV: $${sales.avgOrderValue}`);

    const velocity = buildVelocity(orders, 30);
    console.log(`\n  Top 5 by velocity:`);
    for (const v of velocity.slice(0, 5)) {
      console.log(`    ${v.sku || '—'}: ${v.units}u ($${v.revenue.toFixed(0)}) — ${v.unitsPerDay}/day`);
    }
  }

  // 6. Fit detection check
  console.log('\n6. Fit Detection');
  const FIT_NAMES = /^(lorenzo\s*\d*|alexander\s*\d*|classic|modern|slim|regular|relaxed|tailored|standard|athletic|contemporary)/i;
  const allFits = new Set<string>();
  for (const p of products) {
    for (const v of p.variants) {
      const parts = (v.title || '').split(' / ');
      for (const part of parts) {
        if (FIT_NAMES.test(part.trim())) allFits.add(part.trim());
      }
    }
  }
  if (allFits.size > 0) {
    ok(`Found ${allFits.size} distinct fits: ${[...allFits].join(', ')}`);
  } else {
    console.log('  ⚠ No fit names detected in variant titles');
  }

  console.log('\n═══ All checks passed ═══\n');
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
