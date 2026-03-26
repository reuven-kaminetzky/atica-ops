/**
 * /api/ledger/* — Ledger entries and snapshots
 * Owner: Stallon (API layer), consumed by Deshawn (cash flow)
 * 
 * Routes:
 *   GET  /api/ledger            → ledger entries (?days=30)
 *   POST /api/ledger/snapshot   → take inventory snapshot
 *   GET  /api/ledger/snapshots  → list snapshots
 */

const { createHandler } = require('../../lib/handler');
const { mapLedgerEntry, mapSnapshotProduct } = require('../../lib/mappers');
const { sinceDate } = require('../../lib/analytics');
const cache = require('../../lib/cache');
const store = require('../../lib/store');

// ── Handlers ────────────────────────────────────────────────

async function listLedger(client, { params }) {
  const days = Math.min(parseInt(params.days || '30', 10), 365);
  const ck = cache.makeKey('ledger', { days });
  const cached = cache.get(ck);
  if (cached) return { ...cached, _cached: true };

  const { orders } = await client.getOrders({ created_at_min: sinceDate(days) });
  const entries = orders.map(mapLedgerEntry);
  const result = { days, entries: entries.length, ledger: entries };
  cache.set(ck, result, cache.CACHE_TTL.ledger);
  return result;
}

async function takeSnapshot(client) {
  const { products } = await client.getProducts();
  const timestamp = new Date().toISOString();
  const key = `snap-${timestamp.slice(0, 10)}-${Date.now()}`;
  const snapshot = {
    id: key,
    timestamp,
    productCount: products.length,
    products: products.map(mapSnapshotProduct),
  };
  await store.snapshots.put(key, snapshot);
  return { saved: true, id: key, timestamp, productCount: products.length };
}

async function listSnapshots() {
  const all = await store.snapshots.getAll();
  // Return metadata only, not full product arrays
  const snapshots = all.map(s => ({
    id: s.id || s.key,
    timestamp: s.timestamp,
    productCount: s.productCount,
  }));
  snapshots.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return { count: snapshots.length, snapshots };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',  path: '',          handler: listLedger },
  { method: 'POST', path: 'snapshot',  handler: takeSnapshot },
  { method: 'GET',  path: 'snapshots', handler: listSnapshots, noClient: true },
];

exports.handler = createHandler(ROUTES, 'ledger');
