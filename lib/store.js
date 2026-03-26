/**
 * Server-side persistent storage using Netlify Blobs
 * Owner: Oboosu (infra), consumed by: Deshawn (POs), Shrek (product notes)
 * 
 * Replaces localStorage for anything that needs to persist across
 * browsers, users, and deployments.
 * 
 * Usage:
 *   const store = require('../../lib/store');
 *   const po = await store.po.get('PO-001');
 *   await store.po.put('PO-001', { vendor: 'TAL', ... });
 *   const all = await store.po.list();
 *   await store.po.delete('PO-001');
 */

const { getStore } = require('@netlify/blobs');

// ── Store factory ───────────────────────────────────────────

function createBlobStore(storeName) {
  function getBlobs() {
    return getStore({ name: storeName, consistency: 'strong' });
  }

  return {
    async get(key) {
      try {
        const store = getBlobs();
        const data = await store.get(key, { type: 'json' });
        return data;
      } catch (err) {
        if (err.status === 404 || err.message?.includes('not found')) return null;
        throw err;
      }
    },

    async put(key, value) {
      const store = getBlobs();
      const record = {
        ...value,
        _updatedAt: new Date().toISOString(),
      };
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
      const store = getBlobs();
      const { blobs } = await store.list({ prefix });
      // Parallel reads with concurrency limit to avoid overwhelming Blobs API
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
  };
}

// ── Named stores ────────────────────────────────────────────

module.exports = {
  po:        createBlobStore('purchase-orders'),
  shipments: createBlobStore('shipments'),
  snapshots: createBlobStore('inventory-snapshots'),
  settings:  createBlobStore('app-settings'),
  plm:       createBlobStore('plm-stages'),
};
