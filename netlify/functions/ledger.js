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

// ── Handlers ────────────────────────────────────────────────

async function listLedger(client, { params }) {
  const days = parseInt(params.days || '30', 10);
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
  return {
    timestamp: new Date().toISOString(),
    products: products.map(mapSnapshotProduct),
  };
}

async function listSnapshots() {
  // TODO: Store snapshots in persistent storage (Netlify Blobs, KV, etc.)
  return { snapshots: [] };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET',  path: '',          handler: listLedger },
  { method: 'POST', path: 'snapshot',  handler: takeSnapshot },
  { method: 'GET',  path: 'snapshots', handler: listSnapshots, noClient: true },
];

exports.handler = createHandler(ROUTES, 'ledger');
