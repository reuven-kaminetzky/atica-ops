#!/usr/bin/env node
/**
 * Quick test script to verify Shopify connection
 * Usage: SHOPIFY_STORE_URL=xxx SHOPIFY_ACCESS_TOKEN=xxx node scripts/test-shopify.js
 */

const { createClient } = require('../lib/shopify');

async function main() {
  const client = createClient();
  if (!client) {
    console.error('Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN env vars');
    process.exit(1);
  }

  console.log('Testing Shopify connection...\n');

  try {
    const { shop } = await client._request('/shop.json');
    console.log(`  Store: ${shop.name}`);
    console.log(`  Domain: ${shop.domain}`);
    console.log(`  Plan: ${shop.plan_name}`);
    console.log(`  Currency: ${shop.currency}\n`);
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }

  try {
    const { count } = await client.getProductCount();
    console.log(`  Products: ${count}`);
  } catch (err) {
    console.log(`  Products: error — ${err.message}`);
  }

  try {
    const { count } = await client.getOrderCount();
    console.log(`  Orders: ${count}`);
  } catch (err) {
    console.log(`  Orders: error — ${err.message}`);
  }

  try {
    const { locations } = await client.getLocations();
    console.log(`  Locations: ${locations.map(l => l.name).join(', ')}`);
  } catch (err) {
    console.log(`  Locations: error — ${err.message}`);
  }

  console.log('\nShopify connection OK');
}

main();
