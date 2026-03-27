/**
 * lib/store.js — Unified Storage Layer
 * 
 * Hybrid: uses Postgres (Netlify DB/Neon) when available, Blobs as fallback.
 * Same API surface — callers don't know which backend is active.
 * 
 * Usage:
 *   const store = require('./store');
 *   const po = await store.po.get('PO-001');
 *   await store.po.put('PO-001', { vendor: 'TAL', ... });
 *   const all = await store.po.getAll();
 *   await store.po.delete('PO-001');
 * 
 * New with Postgres (not available with Blobs):
 *   store.po.findByVendor('TAL')
 *   store.po.findByMP('londoner')
 *   store.po.findActive()
 *   store.po.countByStage()
 */

const { getStore } = require('@netlify/blobs');

// ── Blob Store (fallback) ────────────────────────────────

function createBlobStore(storeName) {
  function getBlobs() {
    return getStore({ name: storeName, consistency: 'strong' });
  }

  return {
    _type: 'blob',

    async get(key) {
      try {
        const store = getBlobs();
        return await store.get(key, { type: 'json' });
      } catch (err) {
        if (err.status === 404 || err.message?.includes('not found')) return null;
        console.error(`[store:${storeName}] get(${key}) failed:`, err.message);
        return null;
      }
    },

    async put(key, value) {
      const store = getBlobs();
      const record = { ...value, _updatedAt: new Date().toISOString() };
      await store.setJSON(key, record);
      return record;
    },

    async delete(key) {
      const store = getBlobs();
      await store.delete(key);
      return { deleted: true, key };
    },

    async list(prefix) {
      const store = getBlobs();
      const { blobs } = await store.list({ prefix });
      return blobs.map(b => ({ key: b.key }));
    },

    async getAll(prefix) {
      let store;
      try { store = getBlobs(); } catch (err) {
        console.error(`[store:${storeName}] Failed to get blob store:`, err.message);
        return [];
      }
      let blobs;
      try {
        const result = await store.list({ prefix });
        blobs = result.blobs || [];
      } catch (err) {
        console.error(`[store:${storeName}] Failed to list blobs:`, err.message);
        return [];
      }
      if (blobs.length === 0) return [];

      const CONCURRENCY = 10;
      const results = [];
      for (let i = 0; i < blobs.length; i += CONCURRENCY) {
        const batch = blobs.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (blob) => {
            const data = await store.get(blob.key, { type: 'json' });
            return data ? { key: blob.key, ...data } : null;
          })
        );
        for (const r of batchResults) {
          if (r.status === 'fulfilled' && r.value) results.push(r.value);
        }
      }
      return results;
    },

    // Blob stores don't support queries — return empty for query methods
    async findByVendor() { return this.getAll(); },
    async findByMP() { return this.getAll(); },
    async findActive() { return this.getAll(); },
    async findByStage() { return this.getAll(); },
    async countByStage() { return {}; },
  };
}

// ── Postgres Store (when Neon is available) ────────────────

let _dbModule = null;
let _dbChecked = false;
let _dbAvailable = false;

function getDb() {
  if (_dbModule) return _dbModule;
  try {
    _dbModule = require('./db');
    return _dbModule;
  } catch (e) {
    return null;
  }
}

async function checkDb() {
  if (_dbChecked) return _dbAvailable;
  _dbChecked = true;
  const db = getDb();
  if (!db) return false;
  try {
    _dbAvailable = await db.isAvailable();
    if (_dbAvailable) console.log('[store] Using Postgres (Netlify DB)');
    else console.log('[store] Postgres not available, using Blobs');
    return _dbAvailable;
  } catch (e) {
    console.warn('[store] Postgres check failed:', e.message);
    return false;
  }
}

// ── Hybrid Store (delegates to Postgres or Blobs) ─────────

function createHybridStore(storeName, dbAccessor) {
  const blobStore = createBlobStore(storeName);

  // Wrap each method: try Postgres first, fall back to Blobs
  const hybrid = {};
  const methods = ['get', 'put', 'delete', 'getAll', 'list',
                   'findByVendor', 'findByMP', 'findActive', 'findByStage', 'countByStage'];

  for (const method of methods) {
    hybrid[method] = async function (...args) {
      const useDb = await checkDb();
      if (useDb && dbAccessor) {
        const db = getDb();
        const accessor = db[dbAccessor];
        if (accessor && typeof accessor[method] === 'function') {
          try {
            return await accessor[method](...args);
          } catch (err) {
            console.error(`[store:${storeName}/pg] ${method} failed, falling back to blobs:`, err.message);
          }
        }
      }
      // Fallback to blobs
      return blobStore[method](...args);
    };
  }

  hybrid._type = 'hybrid';
  return hybrid;
}

// ── Named Stores ──────────────────────────────────────────
// PO uses hybrid (Postgres when available, Blobs fallback).
// Other stores stay on Blobs for now — migrate as needed.

module.exports = {
  po:        createHybridStore('purchase-orders', 'po'),
  shipments: createBlobStore('shipments'),
  snapshots: createBlobStore('inventory-snapshots'),
  settings:  createBlobStore('app-settings'),
  plm:       createBlobStore('plm-stages'),
  stack:     createBlobStore('product-stack'),

  // Direct Postgres access for advanced queries
  get db() { return getDb(); },

  // Run migrations (call from /api/status or a setup endpoint)
  async migrate() {
    const db = getDb();
    if (!db) return { error: 'db module not available' };
    return db.migrate();
  },

  // Check which backend is active
  async backend() {
    const useDb = await checkDb();
    return {
      postgres: useDb,
      blobs: true, // always available as fallback
      active: useDb ? 'postgres' : 'blobs',
    };
  },
};
