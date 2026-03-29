#!/usr/bin/env node
/**
 * test.js — Lightweight test harness for Atica Ops
 * 
 * Run: node test.js
 * 
 * Validates:
 * 1. All lib modules import without error
 * 2. Domain model consistency (stages, events, relationships)
 * 3. Products exports (seeds, matchers, business logic)
 * 4. Workflow compute functions return proper shapes
 * 5. Effects functions return proper shapes
 * 6. All Netlify functions pass syntax check
 * 
 * No external dependencies. No test framework.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ═══════════════════════════════════════════════════════════
console.log('\n1. LIB IMPORTS');
// ═══════════════════════════════════════════════════════════

const libs = ['domain', 'workflow', 'effects', 'products', 'shopify', 'handler',
              'cache', 'store', 'auth', 'locations', 'inventory'];

for (const lib of libs) {
  test(`require('./lib/${lib}')`, () => {
    require(`./lib/${lib}`);
  });
}

// ═══════════════════════════════════════════════════════════
console.log('\n2. DOMAIN MODEL CONSISTENCY');
// ═══════════════════════════════════════════════════════════

const domain = require('./lib/domain');

test('MP_LIFECYCLE has 14 stages', () => {
  assert(domain.MP_LIFECYCLE.length === 14, `Got ${domain.MP_LIFECYCLE.length}`);
});

test('PO_LIFECYCLE has 12 stages', () => {
  assert(domain.PO_LIFECYCLE.length === 12, `Got ${domain.PO_LIFECYCLE.length}`);
});

test('Every MP stage has id, name, desc', () => {
  for (const s of domain.MP_LIFECYCLE) {
    assert(s.id && s.name && s.desc, `Stage ${s.id} missing fields`);
  }
});

test('Every PO stage has id, name, desc', () => {
  for (const s of domain.PO_LIFECYCLE) {
    assert(s.id && s.name && s.desc, `Stage ${s.id} missing fields`);
  }
});

test('MP stage IDs are sequential 1-14', () => {
  const ids = domain.MP_LIFECYCLE.map(s => s.id);
  assert(JSON.stringify(ids) === JSON.stringify([...Array(14)].map((_, i) => i + 1)));
});

test('PO stage IDs are sequential 1-12', () => {
  const ids = domain.PO_LIFECYCLE.map(s => s.id);
  assert(JSON.stringify(ids) === JSON.stringify([...Array(12)].map((_, i) => i + 1)));
});

test('canCreatePO only true from Approved (stage 7) onward', () => {
  for (const s of domain.MP_LIFECYCLE) {
    if (s.id < 7) assert(!s.canCreatePO, `Stage ${s.name} (${s.id}) should not allow PO creation`);
  }
  assert(domain.MP_LIFECYCLE[6].canCreatePO, 'Approved stage should allow PO creation');
});

test('PAYMENT_TYPES has 5 types', () => {
  assert(domain.PAYMENT_TYPES.length === 5, `Got ${domain.PAYMENT_TYPES.length}`);
});

test('FACTORY_PACKAGE_SECTIONS has 9 sections', () => {
  assert(domain.FACTORY_PACKAGE_SECTIONS.length === 9, `Got ${domain.FACTORY_PACKAGE_SECTIONS.length}`);
});

test('DOMAIN_EVENTS has 15 events', () => {
  const count = Object.keys(domain.DOMAIN_EVENTS).length;
  assert(count === 15, `Got ${count}`);
});

test('Every DOMAIN_EVENT has data and triggers', () => {
  for (const [name, evt] of Object.entries(domain.DOMAIN_EVENTS)) {
    assert(evt.data, `Event ${name} missing data contract`);
    assert(Array.isArray(evt.triggers), `Event ${name} missing triggers array`);
  }
});

test('MP_STATUS_RULES.compute is a function', () => {
  assert(typeof domain.MP_STATUS_RULES.compute === 'function');
});

test('MP_STATUS_RULES derives correct statuses', () => {
  const compute = domain.MP_STATUS_RULES.compute;
  assert(compute({ plmStage: 3, activePOs: 0, totalInventory: 0, daysOfStock: 0, unitsSold: 0 }) === 'developing');
  assert(compute({ plmStage: 7, activePOs: 0, totalInventory: 0, daysOfStock: 0, unitsSold: 0 }) === 'readyToOrder');
  assert(compute({ plmStage: 12, activePOs: 1, totalInventory: 0, daysOfStock: 0, unitsSold: 0 }) === 'onOrder');
  assert(compute({ plmStage: 12, activePOs: 0, totalInventory: 100, daysOfStock: 90, unitsSold: 50 }) === 'inStore');
  assert(compute({ plmStage: 12, activePOs: 0, totalInventory: 10, daysOfStock: 20, unitsSold: 50 }) === 'needsReorder');
});

// ═══════════════════════════════════════════════════════════
console.log('\n3. PRODUCTS');
// ═══════════════════════════════════════════════════════════

const products = require('./lib/products');

test('MP_SEEDS has 25+ products', () => {
  assert(products.MP_SEEDS.length >= 25, `Got ${products.MP_SEEDS.length}`);
});

test('Every seed has id, name, code, cat', () => {
  for (const s of products.MP_SEEDS) {
    assert(s.id && s.name && s.code && s.cat, `Seed ${s.id || 'unknown'} missing fields`);
  }
});

test('matchProduct returns seed ID for known title', () => {
  const id = products.matchProduct('Londoner White Shirt');
  assert(id === 'londoner', `Got "${id}"`);
});

test('matchAll returns matched + unmatched', () => {
  const result = products.matchAll([]);
  assert('matched' in result && 'unmatched' in result);
});

test('adjustVelocity applies seasonal multipliers', () => {
  assert(products.adjustVelocity(10, 3) === 8.5, 'March should be 0.85x');
  assert(products.adjustVelocity(10, 8) === 14, 'August should be 1.4x');
  assert(products.adjustVelocity(10, 12) === 16, 'December should be 1.6x');
});

test('classifyDemand returns valid signals', () => {
  assert(products.classifyDemand(90, 6) === 'hot');
  assert(products.classifyDemand(75, 4) === 'rising');
  assert(products.classifyDemand(50, 2.5) === 'steady');
  assert(products.classifyDemand(30, 1) === 'slow');
});

test('suggestDistribution totals to input', () => {
  const dist = products.suggestDistribution(100);
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  assert(total === 100, `Distribution totals ${total}, not 100`);
});

test('landedCost computes correctly', () => {
  const landed = products.landedCost(10, 24, 8);
  assert(Math.abs(landed - 13.2) < 0.01, `Got ${landed}`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n4. WORKFLOW COMPUTE');
// ═══════════════════════════════════════════════════════════

const workflow = require('./lib/workflow');

test('computeMPStatus returns proper shape', () => {
  const mp = products.MP_SEEDS[0];
  const status = workflow.computeMPStatus(mp, { pos: [], inventory: {}, velocity: {}, plmData: {} });
  assert(status.mpId === mp.id);
  assert('health' in status);
  assert('flags' in status);
  assert('derivedStatus' in status);
  assert(Array.isArray(status.flags));
});

test('buildFactoryPackage returns proper shape', () => {
  const mp = products.MP_SEEDS[0];
  const pkg = workflow.buildFactoryPackage(mp, {});
  assert(pkg._version);
  assert(pkg.productIdentity);
  assert(pkg.costing);
  assert(typeof pkg.completeness === 'number');
});

test('projectCashFlow returns proper shape', () => {
  const proj = workflow.projectCashFlow([], { revenuePerMonth: 350000 }, 3);
  assert(proj.length === 3, `Got ${proj.length} months`);
  assert(proj[0].outflow);
  assert(proj[0].inflow);
  assert(proj[0].net);
});

// ═══════════════════════════════════════════════════════════
console.log('\n5. EFFECTS ENGINE');
// ═══════════════════════════════════════════════════════════

const effects = require('./lib/effects');

test('onPOStageAdvanced returns {actions, logs}', () => {
  const result = effects.onPOStageAdvanced({ id: 'PO-TEST', mpId: 'londoner' }, 'Concept', 'Design');
  assert(Array.isArray(result.actions));
  assert(Array.isArray(result.logs));
});

test('onPOStageAdvanced fires shipment:create at In Transit', () => {
  const result = effects.onPOStageAdvanced(
    { id: 'PO-TEST', mpId: 'londoner', etd: '2026-06-01', container: 'TCNU1234' },
    'Shipped', 'In Transit'
  );
  const shipmentAction = result.actions.find(a => a.type === 'shipment:create');
  assert(shipmentAction, 'Should create shipment at In Transit');
});

test('generatePaymentSchedule creates payments from PO', () => {
  const po = { id: 'PO-TEST', fob: 10, units: 100, fobTotal: 1000, lead: 90 };
  const payments = effects.generatePaymentSchedule(po);
  assert(payments.length >= 2, `Got ${payments.length} payments`);
  const total = payments.reduce((s, p) => s + p.amount, 0);
  assert(Math.abs(total - 1000) < 100, `Payments total ${total}, expected ~1000`);
});

test('refreshPaymentStatuses updates statuses', () => {
  const payments = [
    { dueDate: '2020-01-01', status: 'planned' },
    { dueDate: '2099-01-01', status: 'planned' },
  ];
  const updated = effects.refreshPaymentStatuses(payments);
  assert(updated[0].status === 'overdue', 'Past due should be overdue');
  assert(updated[1].status === 'planned', 'Future should stay planned');
});

// ═══════════════════════════════════════════════════════════
console.log('\n6. HANDLER + VALIDATE');
// ═══════════════════════════════════════════════════════════

const { validate, RouteError } = require('./lib/handler');

test('validate.days defaults to 30', () => {
  assert(validate.days({}) === 30);
});

test('validate.days respects custom default', () => {
  assert(validate.days({}, 90) === 90);
});

test('validate.days clamps to max 365', () => {
  assert(validate.days({ days: '9999' }) === 365);
});

test('validate.required throws on null body', () => {
  try { validate.required(null, ['x']); assert(false); }
  catch (e) { assert(e instanceof RouteError); }
});

test('validate.required throws on missing fields', () => {
  try { validate.required({ a: 1 }, ['a', 'b']); assert(false); }
  catch (e) { assert(e.message.includes('b')); }
});

test('validate.oneOf accepts valid value', () => {
  assert(validate.oneOf('hot', ['hot', 'cold']) === 'hot');
});

test('validate.oneOf rejects invalid value', () => {
  try { validate.oneOf('warm', ['hot', 'cold'], 'temp'); assert(false); }
  catch (e) { assert(e.message.includes('hot, cold')); }
});

test('validate.date parses valid date', () => {
  const d = validate.date('2026-04-01');
  assert(d.startsWith('2026-04-01'));
});

test('validate.date rejects garbage', () => {
  try { validate.date('not-a-date', 'etd'); assert(false); }
  catch (e) { assert(e.message.includes('etd')); }
});

// ═══════════════════════════════════════════════════════════
console.log('\n7. SYNTAX CHECK — all functions');
// ═══════════════════════════════════════════════════════════

const functionsDir = path.join(__dirname, 'netlify', 'functions');
const functionFiles = fs.readdirSync(functionsDir).filter(f => f.endsWith('.js'));

for (const f of functionFiles) {
  test(`node --check ${f}`, () => {
    execSync(`node --check ${path.join(functionsDir, f)}`, { stdio: 'pipe' });
  });
}

// ═══════════════════════════════════════════════════════════
console.log('\n8. CACHE');
// ═══════════════════════════════════════════════════════════

const cache = require('./lib/cache');

test('cache.makeKey is deterministic', () => {
  const k1 = cache.makeKey('test', { b: 2, a: 1 });
  const k2 = cache.makeKey('test', { a: 1, b: 2 });
  assert(k1 === k2, 'Keys should match regardless of param order');
});

test('cache get/set/expire works', () => {
  cache.set('_test_', 'hello', 1);
  assert(cache.get('_test_') === 'hello');
});

test('cache.clear works', () => {
  cache.set('_test2_', 'world', 60);
  cache.clear();
  assert(cache.get('_test2_') === null);
});

// ═══════════════════════════════════════════════════════════
console.log('\n9. LOCATIONS');
// ═══════════════════════════════════════════════════════════

const locations = require('./lib/locations');

test('normalize handles canonical names', () => {
  assert(locations.normalize('Lakewood') === 'Lakewood');
  assert(locations.normalize('Crown Heights') === 'Crown Heights');
  assert(locations.normalize('Online') === 'Online');
});

test('normalize handles case insensitivity', () => {
  assert(locations.normalize('lakewood') === 'Lakewood');
  assert(locations.normalize('CROWN HEIGHTS') === 'Crown Heights');
  assert(locations.normalize('flatbush') === 'Flatbush');
});

test('normalize handles abbreviations', () => {
  assert(locations.normalize('CH') === 'Crown Heights');
  assert(locations.normalize('FB') === 'Flatbush');
  assert(locations.normalize('Mon') === 'Monsey');
});

test('normalize handles Shopify location variants', () => {
  assert(locations.normalize('Brooklyn Store') === 'Flatbush');
  assert(locations.normalize('Spring Valley') === 'Monsey');
  assert(locations.normalize('Warehouse A') === 'Reserve');
});

test('normalize returns input for unknown locations', () => {
  assert(locations.normalize('Mars Colony') === 'Mars Colony');
});

test('normalize handles null/empty', () => {
  assert(locations.normalize(null) === 'Online');
  assert(locations.normalize('') === 'Online');
});

test('STORES has 6 canonical stores', () => {
  assert(locations.STORES.length === 6, `Got ${locations.STORES.length}`);
});

test('buildLocationMap works', () => {
  const map = locations.buildLocationMap([
    { id: 1, name: 'Lakewood Store' },
    { id: 2, name: 'Crown Heights' },
  ]);
  assert(map[1] === 'Lakewood');
  assert(map[2] === 'Crown Heights');
});

// ═══════════════════════════════════════════════════════════
console.log('\n10. AUTH');
// ═══════════════════════════════════════════════════════════

const auth = require('./lib/auth');

test('cors returns proper headers', () => {
  const headers = auth.cors();
  assert(headers['Access-Control-Allow-Methods'].includes('GET'));
  assert(headers['Access-Control-Allow-Methods'].includes('POST'));
  assert(headers['Access-Control-Max-Age'] === '86400');
});

test('json returns proper response shape', () => {
  const res = auth.json(200, { test: true });
  assert(res.statusCode === 200);
  assert(res.headers['Content-Type'] === 'application/json');
  assert(JSON.parse(res.body).test === true);
});

test('authenticate allows OPTIONS', () => {
  const result = auth.authenticate({ httpMethod: 'OPTIONS', headers: {} });
  assert(result.ok === true);
});

test('authenticate allows when SKIP_AUTH=true', () => {
  const orig = process.env.SKIP_AUTH;
  process.env.SKIP_AUTH = 'true';
  const result = auth.authenticate({ httpMethod: 'GET', headers: {} });
  assert(result.ok === true);
  assert(result.source === 'skip');
  process.env.SKIP_AUTH = orig;
});

// ═══════════════════════════════════════════════════════════
// PRODUCT MATCHING — the foundation of the system
// ═══════════════════════════════════════════════════════════

console.log('\n--- Product Matching (critical) ---');

const { matchProduct } = require('./lib/products');

test('matches Lorenzo/Alexander HC suit to hc-suit MP', () => {
  // Lorenzo and Alexander are FITS, not separate MPs
  // They all match to hc-suit (or italian-hc by price)
  assert(matchProduct('Atica Man Half Canvas Suit Lorenzo 6 Drop | Navy') === 'hc-suit');
  assert(matchProduct('Atica Man Half Canvas Suit | Charcoal') === 'hc-suit');
});

test('matches Italian HC suit correctly', () => {
  assert(matchProduct('Atica Man Italian Fabric Half Canvas Suit | Charcoal') === 'italian-hc');
  assert(matchProduct('Atica Man Italian Fabric Half Canvas Suit | Navy') === 'italian-hc');
});

test('matches HC suit vs Italian HC by title keywords', () => {
  assert(matchProduct('Atica Man Half Canvas Suit | Navy', 360) === 'hc-suit');
  assert(matchProduct('Atica Man Italian Fabric Half Canvas Suit | Charcoal', 480) === 'italian-hc');
});

test('matches Londoner shirt correctly', () => {
  assert(matchProduct('Atica Man Londoner Shirt | Light Blue') === 'londoner');
});

test('matches white dress shirt correctly', () => {
  const id = matchProduct('Atica Man Milano Shirt | White');
  assert(id === 'white-dress');
});

test('matches colored dress shirt correctly', () => {
  const id = matchProduct('Atica Man Bengal Stripe Shirt | Blue');
  assert(id === 'colored-dress');
});

test('matches ties correctly', () => {
  const id = matchProduct('Atica Man Tie | Navy Dots');
  assert(id === 'ties');
});

test('does not match gift cards', () => {
  assert(matchProduct('Gift Card') === null || matchProduct('Gift Card') === undefined);
});

test('does not match shipping items', () => {
  assert(matchProduct('Shipping') === null || matchProduct('Shipping') === undefined);
});

// ═══════════════════════════════════════════════════════════
// DOMAIN MODULE EXPORTS
// ═══════════════════════════════════════════════════════════

console.log('\n--- Domain Module Exports ---');

test('product module exports all required methods', () => {
  const product = require('./lib/product');
  const required = ['matchProduct', 'classifyDemand', 'adjustVelocity', 
    'updateShopifyData', 'upsertStyle', 'updateTotalInventory', 'updateVelocity', 'getAll'];
  for (const m of required) {
    assert(typeof product[m] === 'function', `Missing: product.${m}`);
  }
});

test('supply-chain module exports PO and vendor operations', () => {
  const sc = require('./lib/supply-chain');
  assert(typeof sc.po.getAll === 'function');
  assert(typeof sc.po.create === 'function');
  assert(typeof sc.vendor.getAll === 'function');
  assert(typeof sc.payment.getAllWithPO === 'function');
});

test('finance module exports cash flow functions', () => {
  const finance = require('./lib/finance');
  assert(typeof finance.getOpex === 'function');
});

test('logger exports structured log methods', () => {
  const log = require('./lib/logger');
  assert(typeof log.info === 'function');
  assert(typeof log.warn === 'function');
  assert(typeof log.error === 'function');
});

// ═══════════════════════════════════════════════════════════
// CONSTANTS INTEGRITY
// ═══════════════════════════════════════════════════════════

console.log('\n--- Constants Integrity ---');

const constants = require('./lib/constants');

test('seasonal multipliers cover all 12 months', () => {
  for (let m = 1; m <= 12; m++) {
    const mult = constants.SEASONAL_MULTIPLIERS[m];
    assert(typeof mult === 'number' && mult > 0 && mult < 3, `Month ${m}: ${mult}`);
  }
});

test('reorder velocity days is reasonable', () => {
  assert(constants.REORDER_VELOCITY_DAYS >= 14 && constants.REORDER_VELOCITY_DAYS <= 90);
});

test('projection weeks is set', () => {
  assert(constants.PROJECTION_WEEKS > 0 && constants.PROJECTION_WEEKS <= 52);
});

// ═══════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
