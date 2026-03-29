/**
 * /api/sync/* — Trigger and monitor background sync
 * Owner: Bonney (Data Pipeline)
 *
 * Routes:
 *   POST /api/sync/trigger   → trigger background sync, return immediately
 *   GET  /api/sync/status    → current sync status from database
 *   GET  /api/sync/unmatched → unmatched product titles from last sync
 *
 * Status lives in app_settings table (not Blobs) — same place
 * sync-background.js writes to. Blobs are only used for optional
 * product caching and history.
 */

const { createHandler, RouteError } = require('../../lib/handler');
const { neon } = require('@netlify/neon');

// ── Helpers ─────────────────────────────────────────────────

async function getAppSetting(sql, key) {
  const [row] = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return row ? JSON.parse(row.value) : null;
}

async function setAppSetting(sql, key, obj) {
  const value = JSON.stringify(obj);
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
}

// ── Handlers ────────────────────────────────────────────────

async function triggerSync() {
  const sql = neon();

  // Guard: don't re-trigger if already running
  const current = await getAppSetting(sql, 'sync_status');
  if (current && current.status === 'running') {
    return { triggered: false, message: 'Sync already running', step: current.step };
  }

  // Set initial status in database
  await setAppSetting(sql, 'sync_status', {
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
    await setAppSetting(sql, 'sync_status', {
      status: 'failed',
      error: `Failed to trigger background function: ${err.message}`,
      updatedAt: new Date().toISOString(),
    });
    throw new RouteError(502, `Failed to trigger background sync: ${err.message}`);
  }
}

async function syncStatus() {
  const sql = neon();
  const status = await getAppSetting(sql, 'sync_status');
  if (status) return status;
  return { status: 'never_run', message: 'No sync has been run yet.' };
}

async function unmatchedTitles() {
  const sql = neon();
  const data = await getAppSetting(sql, 'unmatched_titles');
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
