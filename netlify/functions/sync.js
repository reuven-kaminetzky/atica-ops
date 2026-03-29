/**
 * /api/sync/* — Trigger and monitor background sync
 * Owner: Bonney (Data Pipeline)
 *
 * Routes:
 *   POST /api/sync/trigger   → trigger background sync, return immediately
 *   GET  /api/sync/status    → current sync status from Blob store
 *   GET  /api/sync/unmatched → unmatched product titles from last sync
 */

const { createHandler, RouteError } = require('../../lib/handler');
const { getStore } = require('@netlify/blobs');

function syncStore() {
  return getStore({ name: 'sync', consistency: 'strong' });
}

// ── Handlers ────────────────────────────────────────────────

async function triggerSync() {
  const store = syncStore();

  // Check if already running
  const current = await store.get('sync-status', { type: 'json' }).catch(() => null);
  if (current && current.status === 'running') {
    return { triggered: false, message: 'Sync already running', step: current.step };
  }

  // Set initial status
  await store.setJSON('sync-status', {
    status: 'starting',
    startedAt: new Date().toISOString(),
    triggeredBy: 'settings-ui',
    updatedAt: new Date().toISOString(),
  });

  // Trigger background function
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://atica-ops.netlify.app';
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/sync-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'settings-ui' }),
    });
    return {
      triggered: true,
      backgroundStatus: res.status,
      message: 'Sync started. Poll /api/sync/status for progress.',
    };
  } catch (err) {
    await store.setJSON('sync-status', {
      status: 'failed',
      error: `Failed to trigger background function: ${err.message}`,
      updatedAt: new Date().toISOString(),
    });
    throw new RouteError(502, `Failed to trigger background sync: ${err.message}`);
  }
}

async function syncStatus() {
  const store = syncStore();
  const status = await store.get('sync-status', { type: 'json' }).catch(() => null);
  if (status) return status;
  return { status: 'never_run', message: 'No sync has been run yet.' };
}

async function unmatchedTitles() {
  const store = syncStore();
  const data = await store.get('unmatched-titles', { type: 'json' }).catch(() => null);
  if (data) return data;
  return { count: 0, titles: [], message: 'No unmatched data. Run a sync first.' };
}

// ── Routes ──────────────────────────────────────────────────

const ROUTES = [
  { method: 'POST', path: 'trigger',   handler: triggerSync,    noClient: true },
  { method: 'GET',  path: 'status',    handler: syncStatus,     noClient: true },
  { method: 'GET',  path: 'unmatched', handler: unmatchedTitles, noClient: true },
];

exports.handler = createHandler(ROUTES, 'sync');
