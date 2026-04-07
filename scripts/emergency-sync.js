#!/usr/bin/env node
/**
 * Emergency DB + Shopify Sync Script
 *
 * Runs all migrations, seeds data, queries Shopify, triggers sync,
 * verifies data flows, and registers webhooks.
 *
 * Usage:
 *   export DATABASE_URL="postgresql://..."
 *   export SHOPIFY_ACCESS_TOKEN="shpat_..."
 *   export SHOPIFY_STORE_URL="atica-brand.myshopify.com"
 *   export ATICA_API_KEY="atica-admin-2026-ops"
 *   node scripts/emergency-sync.js
 *
 * Or with the deployed app:
 *   node scripts/emergency-sync.js --remote
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATABASE_URL = process.env.DATABASE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || 'atica-brand.myshopify.com';
const ATICA_API_KEY = process.env.ATICA_API_KEY || 'atica-admin-2026-ops';
const SITE_URL = process.env.SITE_URL || 'https://atica-ops-v3.netlify.app';
const REMOTE_MODE = process.argv.includes('--remote');

// ── Helpers ──────────────────────────────────────────────────
function hr(label) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(60)}\n`);
}

function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function fail(msg) { console.log(`  ✗ ${msg}`); }

function httpGet(hostname, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname, path: urlPath, headers, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpPost(hostname, urlPath, body = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname, path: urlPath, method: 'POST', timeout: 30000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), ...headers },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(postData);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const shopifyGet = (urlPath) => httpGet(SHOPIFY_STORE_URL, '/admin/api/2025-04' + urlPath, {
  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
});

// ── PHASE 1: Database Migrations ─────────────────────────────
async function phase1_database() {
  hr('PHASE 1: DATABASE MIGRATIONS');

  if (REMOTE_MODE) {
    console.log('  Running migrations via deployed API...');
    try {
      const res = await httpPost(
        new URL(SITE_URL).hostname,
        '/api/migrate',
        '',
        { 'X-Api-Key': ATICA_API_KEY, 'X-Confirm-Destructive': 'true' }
      );
      console.log('  Migrate response:', JSON.stringify(res.data, null, 2).slice(0, 500));
      if (res.status >= 200 && res.status < 300) ok('Migrations complete');
      else warn(`Migration status ${res.status}`);
    } catch (e) {
      fail(`Migration failed: ${e.message}`);
    }
    return;
  }

  // Direct DB mode
  if (!DATABASE_URL) {
    fail('DATABASE_URL not set. Cannot run migrations directly.');
    console.log('  Set DATABASE_URL or use --remote flag');
    return;
  }

  const { neon } = require('@neondatabase/serverless');
  const sql = neon(DATABASE_URL);

  // Check existing tables
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  console.log('  Existing tables:', tables.map(t => t.tablename).join(', ') || 'none');

  // Check master_products columns
  try {
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='master_products' ORDER BY ordinal_position`;
    console.log('  master_products columns:', cols.map(c => c.column_name).join(', '));
  } catch { console.log('  master_products table does not exist yet'); }

  // Run all migrations
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  console.log(`\n  Running ${files.length} migrations...`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Smart SQL statement splitting (handles $$ function bodies)
    const stmts = [];
    let current = '';
    let inDollar = false;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') && !inDollar) continue;

      if (trimmed.includes('$$')) {
        inDollar = !inDollar;
      }

      current += line + '\n';

      if (!inDollar && trimmed.endsWith(';')) {
        const stmt = current.trim();
        if (stmt && stmt !== ';') stmts.push(stmt);
        current = '';
      }
    }
    if (current.trim()) stmts.push(current.trim());

    let executed = 0, skipped = 0;
    for (const stmt of stmts) {
      const clean = stmt.replace(/;$/, '').trim();
      if (!clean) continue;
      try {
        await sql(clean);
        executed++;
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate') ||
            msg.includes('does not exist') || msg.includes('cannot drop')) {
          skipped++;
        } else {
          warn(`${file}: ${msg.slice(0, 80)}`);
          skipped++;
        }
      }
    }
    ok(`${file}: ${executed} executed, ${skipped} skipped`);
  }

  // Verify critical tables/columns exist
  console.log('\n  Verifying schema...');
  const verifyTables = ['master_products', 'styles', 'sales', 'skus', 'inventory_events', 'orders', 'locations'];
  for (const table of verifyTables) {
    try {
      const [row] = await sql`SELECT COUNT(*) as n FROM information_schema.tables WHERE table_schema='public' AND table_name=${table}`;
      if (parseInt(row.n) > 0) ok(`${table} exists`);
      else fail(`${table} MISSING`);
    } catch (e) { fail(`${table}: ${e.message.slice(0, 60)}`); }
  }

  // Check external_ids column
  try {
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='master_products' AND column_name='external_ids'`;
    if (cols.length > 0) ok('external_ids column exists');
    else {
      warn('external_ids column missing - checking for shopify_product_ids...');
      const old = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='master_products' AND column_name='shopify_product_ids'`;
      if (old.length > 0) {
        console.log('  Renaming shopify_product_ids → external_ids...');
        await sql`ALTER TABLE master_products RENAME COLUMN shopify_product_ids TO external_ids`;
        ok('Column renamed');
      }
    }
  } catch (e) { fail(`Column check: ${e.message.slice(0, 60)}`); }

  // Check locations seeded
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM locations`;
    console.log(`  Locations: ${row.n} rows`);
    if (parseInt(row.n) === 0) warn('Locations table empty - migration 012 should seed them');
  } catch (e) { warn(`Locations: ${e.message.slice(0, 40)}`); }

  // Check MP count
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM master_products`;
    console.log(`  Master Products: ${row.n}`);
    if (parseInt(row.n) === 0) warn('No MPs - seed needed');
  } catch (e) { warn(`MPs: ${e.message.slice(0, 40)}`); }

  return sql;
}

// ── PHASE 1b: Seed if needed ────────────────────────────────
async function phase1b_seed(sql) {
  if (REMOTE_MODE) {
    console.log('\n  Checking if seed is needed via API...');
    try {
      const res = await httpPost(
        new URL(SITE_URL).hostname,
        '/api/seed',
        '',
        { 'X-Api-Key': ATICA_API_KEY, 'X-Confirm-Destructive': 'true' }
      );
      console.log('  Seed response:', JSON.stringify(res.data, null, 2).slice(0, 300));
      if (res.status >= 200 && res.status < 300) ok('Seed complete');
      else warn(`Seed status ${res.status}`);
    } catch (e) {
      fail(`Seed failed: ${e.message}`);
    }
    return;
  }

  if (!sql) return;
  const [row] = await sql`SELECT COUNT(*) as n FROM master_products`;
  if (parseInt(row.n) === 0) {
    warn('No MPs found. Triggering seed...');
    console.log('  Run: curl -X POST ' + SITE_URL + '/api/seed -H "X-Confirm-Destructive: true" -H "X-Api-Key: ' + ATICA_API_KEY + '"');
  } else {
    ok(`${row.n} MPs already seeded`);
    // Show sample
    const sample = await sql`SELECT id, name, total_inventory FROM master_products LIMIT 5`;
    sample.forEach(r => console.log(`    ${r.id}: ${r.name} (inv: ${r.total_inventory || 0})`));
  }
}

// ── PHASE 2: Shopify Data ────────────────────────────────────
async function phase2_shopify() {
  hr('PHASE 2: SHOPIFY DATA');

  if (!SHOPIFY_ACCESS_TOKEN) {
    fail('SHOPIFY_ACCESS_TOKEN not set. Skipping Shopify queries.');
    return {};
  }

  // Product count
  let productCount = 0;
  try {
    const data = await shopifyGet('/products/count.json');
    productCount = data.count;
    ok(`Total Shopify products: ${productCount}`);
  } catch (e) {
    fail(`Product count: ${e.message}`);
  }

  // Get ALL products with option structures
  let allProducts = [];
  try {
    console.log('\n  Fetching all products (paginated)...');
    let page = 1;
    while (true) {
      const data = await shopifyGet(`/products.json?limit=250&page=${page}&fields=id,title,options,variants`);
      const products = data.products || [];
      if (!products.length) break;
      allProducts.push(...products);
      if (products.length < 250) break;
      page++;
    }
    ok(`Fetched ${allProducts.length} products`);
  } catch (e) {
    fail(`Product fetch: ${e.message}`);
  }

  // Analyze option patterns
  const patterns = {};
  for (const p of allProducts) {
    const key = (p.options || []).map(o => o.name).join(' | ') || 'no options';
    if (!patterns[key]) patterns[key] = { count: 0, examples: [] };
    patterns[key].count++;
    if (patterns[key].examples.length < 3) patterns[key].examples.push(p.title);
  }

  console.log('\n  Option patterns:');
  for (const [key, val] of Object.entries(patterns).sort((a, b) => b.count - a.count)) {
    console.log(`    [${key}] (${val.count} products)`);
    val.examples.forEach(t => console.log(`      ${t}`));
  }

  // Get locations
  let locations = [];
  try {
    const data = await shopifyGet('/locations.json');
    locations = data.locations || [];
    console.log('\n  Shopify locations:');
    locations.forEach(l => console.log(`    ${l.id} ${l.name} ${l.active ? 'ACTIVE' : 'inactive'}`));
    ok(`${locations.length} locations found`);
  } catch (e) {
    fail(`Locations: ${e.message}`);
  }

  return { productCount, allProducts, patterns, locations };
}

// ── PHASE 3: Trigger Sync ────────────────────────────────────
async function phase3_sync() {
  hr('PHASE 3: TRIGGER SYNC');

  const hostname = new URL(SITE_URL).hostname;
  const headers = { 'X-Api-Key': ATICA_API_KEY };

  // Trigger via API
  console.log('  Triggering sync...');
  try {
    const res = await httpPost(hostname, '/api/sync/trigger', '', headers);
    console.log('  Trigger response:', res.status, JSON.stringify(res.data).slice(0, 200));
  } catch (e) {
    warn(`Trigger failed: ${e.message}. Trying background function directly...`);
  }

  // Call background function directly
  try {
    const res = await httpPost(hostname, '/.netlify/functions/sync-background', { triggeredBy: 'emergency' }, {});
    console.log('  Background function response:', res.status);
  } catch (e) {
    warn(`Background function: ${e.message}`);
  }

  // Poll status
  console.log('\n  Polling sync status...');
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (5s intervals)
  while (attempts < maxAttempts) {
    await sleep(5000);
    attempts++;
    try {
      const status = await httpGet(hostname, '/api/sync/status', headers);
      const s = status.sync || status;
      const statusStr = s.status || 'unknown';
      const step = s.step || '';
      console.log(`  [${attempts}] Status: ${statusStr} ${step ? '(' + step + ')' : ''}`);

      if (statusStr === 'done') {
        ok('Sync completed!');
        if (s.results) {
          console.log('  Results:', JSON.stringify(s.results, null, 2));
        }
        return true;
      }
      if (statusStr === 'failed') {
        fail(`Sync failed: ${s.error || 'unknown'}`);
        return false;
      }
    } catch (e) {
      warn(`Poll error: ${e.message}`);
    }
  }
  warn('Sync polling timed out after 5 minutes');
  return false;
}

// ── PHASE 4: Verify Data ─────────────────────────────────────
async function phase4_verify(sql) {
  hr('PHASE 4: VERIFY DATA');

  if (REMOTE_MODE || !sql) {
    console.log('  Skipping direct DB verification in remote mode.');
    console.log('  Check data via: curl ' + SITE_URL + '/api/verify -H "X-Api-Key: ' + ATICA_API_KEY + '"');
    return;
  }

  // Top inventory
  try {
    const rows = await sql`SELECT id, name, category, total_inventory, hero_image IS NOT NULL as has_img FROM master_products WHERE total_inventory > 0 ORDER BY total_inventory DESC LIMIT 10`;
    console.log('  Top inventory MPs:');
    rows.forEach(r => console.log(`    ${r.id}: ${r.name} (${r.category}) inv=${r.total_inventory} img=${r.has_img}`));
    ok(`${rows.length} MPs with inventory`);
  } catch (e) { fail(`Inventory check: ${e.message.slice(0, 60)}`); }

  // Styles count
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM styles`;
    ok(`Styles: ${row.n}`);
  } catch (e) { fail(`Styles: ${e.message.slice(0, 40)}`); }

  // Sales count + by store
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM sales`;
    ok(`Sales: ${row.n}`);
    const byStore = await sql`SELECT store, COUNT(*) as n, SUM(total)::numeric as revenue FROM sales GROUP BY store`;
    byStore.forEach(r => console.log(`    ${r.store}: ${r.n} sales, $${parseFloat(r.revenue || 0).toFixed(2)}`));
  } catch (e) { fail(`Sales: ${e.message.slice(0, 40)}`); }

  // SKUs
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM skus`;
    ok(`SKUs: ${row.n}`);
  } catch (e) { fail(`SKUs: ${e.message.slice(0, 40)}`); }

  // Inventory events
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM inventory_events`;
    ok(`Inventory events: ${row.n}`);
  } catch (e) { fail(`Inventory events: ${e.message.slice(0, 40)}`); }

  // Orders
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM orders`;
    ok(`Orders: ${row.n}`);
  } catch (e) { fail(`Orders: ${e.message.slice(0, 40)}`); }
}

// ── PHASE 5: Fix Sync Issues ─────────────────────────────────
async function phase5_fix(sql) {
  hr('PHASE 5: CHECK & FIX');

  if (REMOTE_MODE || !sql) {
    console.log('  In remote mode, fixes are applied by re-triggering sync.');
    return;
  }

  // Check if total_inventory is 0 for all
  try {
    const [row] = await sql`SELECT COUNT(*) as n FROM master_products WHERE total_inventory > 0`;
    if (parseInt(row.n) === 0) {
      warn('All MPs have zero inventory! Checking column...');

      // Check if wrong column exists
      const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='master_products'`;
      const colNames = cols.map(c => c.column_name);

      if (colNames.includes('shopify_product_ids') && !colNames.includes('external_ids')) {
        console.log('  Found shopify_product_ids but not external_ids. Renaming...');
        await sql`ALTER TABLE master_products RENAME COLUMN shopify_product_ids TO external_ids`;
        ok('Column renamed. Re-trigger sync to populate.');
      } else if (colNames.includes('external_ids')) {
        warn('external_ids exists but inventory is 0. Sync may not have run yet.');
      }
    } else {
      ok(`${row.n} MPs have inventory > 0`);
    }
  } catch (e) { fail(`Fix check: ${e.message.slice(0, 60)}`); }
}

// ── PHASE 6: Register Webhooks ───────────────────────────────
async function phase6_webhooks() {
  hr('PHASE 6: REGISTER WEBHOOKS');

  const hostname = new URL(SITE_URL).hostname;
  try {
    const res = await httpPost(hostname, '/api/webhooks/register', '', {
      'X-Api-Key': ATICA_API_KEY,
    });
    console.log('  Webhook registration:', res.status, JSON.stringify(res.data).slice(0, 300));
    if (res.status >= 200 && res.status < 300) ok('Webhooks registered');
    else warn(`Webhook registration status ${res.status}`);
  } catch (e) {
    fail(`Webhook registration: ${e.message}`);
  }
}

// ── PHASE 7: Report ──────────────────────────────────────────
async function phase7_report(sql, shopifyData) {
  hr('PHASE 7: FINAL REPORT');

  const report = {};

  if (sql && !REMOTE_MODE) {
    try {
      const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      report.tableCount = tables.length;
      console.log(`  1. Tables: ${tables.length}`);
      console.log(`     ${tables.map(t => t.tablename).join(', ')}`);
    } catch { report.tableCount = 'unknown'; }

    try {
      const [row] = await sql`SELECT COUNT(*) as n FROM master_products WHERE total_inventory > 0`;
      report.mpsWithInventory = parseInt(row.n);
      console.log(`  2. MPs with inventory > 0: ${row.n}`);
    } catch { report.mpsWithInventory = 'unknown'; }

    try {
      const [row] = await sql`SELECT COUNT(*) as n FROM styles`;
      report.styles = parseInt(row.n);
      console.log(`  3. Styles: ${row.n}`);
    } catch { report.styles = 'unknown'; }

    try {
      const [row] = await sql`SELECT COUNT(*) as n FROM sales`;
      report.sales = parseInt(row.n);
      console.log(`  4. Sales: ${row.n}`);
    } catch { report.sales = 'unknown'; }
  }

  if (shopifyData) {
    console.log(`  5. Shopify option patterns:`);
    if (shopifyData.patterns) {
      for (const [key, val] of Object.entries(shopifyData.patterns).sort((a, b) => b.count - a.count)) {
        console.log(`     [${key}] → ${val.count} products`);
      }
    }
    console.log(`  6. Shopify locations:`);
    if (shopifyData.locations) {
      shopifyData.locations.forEach(l => console.log(`     ${l.id} ${l.name} ${l.active ? 'ACTIVE' : 'inactive'}`));
    }
  }

  console.log('\n  Done!');
  return report;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ATICA OPS — Emergency DB + Shopify Sync               ║');
  console.log('║  Mode: ' + (REMOTE_MODE ? 'REMOTE (via API)' : 'DIRECT (DB + Shopify)') + '                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!REMOTE_MODE && !DATABASE_URL) {
    console.log('\n  No DATABASE_URL set. Running in remote mode...');
  }

  let sql = null;
  try {
    sql = await phase1_database();
    await phase1b_seed(sql);
  } catch (e) {
    fail(`Phase 1 error: ${e.message}`);
  }

  let shopifyData = {};
  try {
    shopifyData = await phase2_shopify();
  } catch (e) {
    fail(`Phase 2 error: ${e.message}`);
  }

  try {
    await phase3_sync();
  } catch (e) {
    fail(`Phase 3 error: ${e.message}`);
  }

  try {
    await phase4_verify(sql);
  } catch (e) {
    fail(`Phase 4 error: ${e.message}`);
  }

  try {
    await phase5_fix(sql);
  } catch (e) {
    fail(`Phase 5 error: ${e.message}`);
  }

  try {
    await phase6_webhooks();
  } catch (e) {
    fail(`Phase 6 error: ${e.message}`);
  }

  try {
    await phase7_report(sql, shopifyData);
  } catch (e) {
    fail(`Phase 7 error: ${e.message}`);
  }
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
