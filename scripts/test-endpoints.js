#!/usr/bin/env node
/**
 * Endpoint smoke test — hit every modular route, verify 200 or expected error.
 * Run: node scripts/test-endpoints.js [base_url]
 * Default: https://atica-ops.netlify.app
 */

const BASE = process.argv[2] || 'https://atica-ops.netlify.app';
const results = [];

async function test(method, path, body, expect) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => null);
    const ok = expect ? expect(res.status, data) : res.status === 200;
    const label = ok ? '✓' : '✗';
    results.push({ ok, method, path, status: res.status });
    const preview = data ? JSON.stringify(data).slice(0, 80) : '(no body)';
    console.log(`  ${label} ${method.padEnd(6)} ${path.padEnd(40)} ${res.status} ${ok ? '' : '← FAIL'} ${preview}`);
  } catch (err) {
    results.push({ ok: false, method, path, status: 'ERR' });
    console.log(`  ✗ ${method.padEnd(6)} ${path.padEnd(40)} ERR  ${err.message}`);
  }
}

async function run() {
  console.log(`\n  Testing: ${BASE}\n`);

  // Status
  await test('GET', '/api/status');

  // Products
  await test('GET', '/api/products');
  await test('GET', '/api/products/titles');
  await test('GET', '/api/products/trees');
  await test('GET', '/api/products/sku-map');
  await test('POST', '/api/products/sync');

  // Orders
  await test('GET', '/api/orders');
  await test('GET', '/api/orders/velocity?days=30');
  await test('GET', '/api/orders/sales?days=30');
  await test('GET', '/api/orders/drafts');
  await test('POST', '/api/orders/sync', { since: new Date(Date.now() - 7 * 86400000).toISOString() });

  // Inventory
  await test('GET', '/api/inventory');

  // POS
  await test('GET', '/api/pos/today');
  await test('GET', '/api/pos/by-location?days=7');
  await test('GET', '/api/pos/feed?limit=5');

  // Ledger
  await test('GET', '/api/ledger?days=30');

  // Customers
  await test('GET', '/api/customers');
  await test('GET', '/api/customers/top?days=90');
  await test('GET', '/api/customers/segments');

  // Purchase orders (Blobs)
  await test('GET', '/api/purchase-orders');

  // Shipments (Blobs)
  await test('GET', '/api/shipments');

  // PO CRUD cycle
  console.log('\n  --- PO CRUD cycle ---');
  const createRes = await fetch(`${BASE}/api/purchase-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vendor: 'TEST-VENDOR', mpId: 'test-mp', units: 10, fob: 25 }),
  });
  const created = await createRes.json().catch(() => null);
  if (created && created.po && created.po.id) {
    const poId = created.po.id;
    console.log(`  ✓ POST   /api/purchase-orders              ${createRes.status} → ${poId}`);

    await test('GET', `/api/purchase-orders/${poId}`);
    await test('PATCH', `/api/purchase-orders/${poId}`, { notes: 'test update' });
    await test('DELETE', `/api/purchase-orders/${poId}`);
  } else {
    console.log(`  ✗ POST   /api/purchase-orders              ${createRes.status} ← CREATE FAILED`);
  }

  // Legacy route should 404 now
  console.log('\n  --- Legacy route (should fail) ---');
  await test('GET', '/api/shopify/status', null, (s) => s !== 200);

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n  ════════════════════════════════════════`);
  console.log(`  ${passed} passed, ${failed} failed out of ${results.length} tests`);
  console.log(`  ════════════════════════════════════════\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
