#!/usr/bin/env node
/**
 * Verify Shopify connection and print store summary
 * Usage: SHOPIFY_STORE_URL=xxx SHOPIFY_ACCESS_TOKEN=xxx node scripts/test-shopify.js
 */

const { createClient } = require('../lib/shopify');

async function probe(label, fn) {
  try {
    const result = await fn();
    console.log(`  ${label}: ${result}`);
  } catch (err) {
    console.log(`  ${label}: error — ${err.message}`);
  }
}

async function main() {
  const client = createClient();
  if (!client) {
    console.error('Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN env vars');
    process.exit(1);
  }

  console.log('Testing Shopify connection...\n');

  const { shop } = await client._request('/shop.json');
  console.log(`  Store:    ${shop.name}`);
  console.log(`  Domain:   ${shop.domain}`);
  console.log(`  Plan:     ${shop.plan_name}`);
  console.log(`  Currency: ${shop.currency}\n`);

  await probe('Products',  async () => (await client.getProductCount()).count);
  await probe('Orders',    async () => (await client.getOrderCount()).count);
  await probe('Locations', async () => (await client.getLocations()).locations.map(l => l.name).join(', '));

  console.log('\nDone.');
}

main().catch(err => { console.error('Connection failed:', err.message); process.exit(1); });
