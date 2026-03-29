/**
 * Settings Module — Connection status, sync controls, cache management
 * Owner: Bonney (sync), Stallon (original)
 *
 * API endpoints:
 *   GET  /api/status           → Shopify connection check
 *   GET  /api/status/cache     → cache stats
 *   POST /api/status/cache/clear → clear cache
 *   POST /api/status/webhooks  → setup webhooks
 *   POST /api/sync/trigger     → trigger full background sync
 *   GET  /api/sync/status      → poll sync progress
 */

import { on, emit } from './event-bus.js';
import { api, skeleton, formatDateTime } from './core.js';

let state = { loaded: false, status: null, cache: null, syncStatus: null };
let _container = null;
let _pollTimer = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Settings</h2>
    </div>
    <div id="settings-content">${skeleton(4)}</div>
  `;

  try {
    const [status, cache, syncStatus] = await Promise.all([
      api.get('/api/status'),
      api.get('/api/status/cache'),
      api.silent.get('/api/sync/status').catch(() => null),
    ]);
    state.status = status;
    state.cache = cache;
    state.syncStatus = syncStatus;
    state.loaded = true;
    render();

    // If sync is currently running, start polling
    if (syncStatus && (syncStatus.status === 'running' || syncStatus.status === 'starting')) {
      startPolling();
    }
  } catch (err) {
    document.getElementById('settings-content').innerHTML =
      `<div class="empty-state">Failed to load settings: ${err.message}</div>`;
  }

  bindEvents();
}

// ── Sync step labels ────────────────────────────────────────

const STEP_LABELS = {
  connecting: 'Connecting to Shopify...',
  fetching_products: 'Fetching products from Shopify...',
  matching: 'Matching products to Master Products...',
  updating_mps: 'Updating master products...',
  creating_styles: 'Creating style records...',
  fetching_orders: 'Fetching recent orders...',
  computing_velocity: 'Computing velocity & demand signals...',
};

function syncStepIndex(step) {
  const steps = Object.keys(STEP_LABELS);
  const idx = steps.indexOf(step);
  return idx >= 0 ? idx + 1 : 0;
}

// ── Render ──────────────────────────────────────────────────

function render() {
  const el = document.getElementById('settings-content');
  if (!el || !state.loaded) return;

  const s = state.status;
  const c = state.cache;

  el.innerHTML = `
    <div class="settings-section">
      <h3>Shopify Connection</h3>
      <div class="connection-card ${s?.connected ? 'connected' : 'disconnected'}">
        <div class="conn-status">${s?.connected ? '● Connected' : '○ Disconnected'}</div>
        ${s?.connected ? `
          <div class="conn-detail">Shop: ${s.shop}</div>
          <div class="conn-detail">Domain: ${s.domain}</div>
          <div class="conn-detail">Plan: ${s.plan}</div>
          <div class="conn-detail">Currency: ${s.currency}</div>
          <div class="conn-detail">API Version: ${s.apiVersion || '—'}</div>
          <div class="conn-detail">Store URL: ${s.storeUrl || '—'}</div>
        ` : `
          <div class="conn-detail" style="color:var(--danger)">${s?.message || 'Not connected'}</div>
          ${s?.hint ? `<div class="conn-detail" style="font-size:0.78rem;color:var(--text-dim);margin-top:0.5rem">${s.hint}</div>` : ''}
          ${s?.apiVersion ? `<div class="conn-detail">Tried API: ${s.apiVersion}</div>` : ''}
          ${s?.storeUrl ? `<div class="conn-detail">Tried Store: ${s.storeUrl}</div>` : ''}
          ${s?.baseUrl ? `<div class="conn-detail" style="font-family:var(--font-mono);font-size:0.75rem;word-break:break-all">${s.baseUrl}</div>` : ''}
        `}
      </div>
    </div>

    <div class="settings-section">
      <h3>Full Sync</h3>
      <p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.75rem">
        Runs the complete pipeline: products, styles, orders, sales, velocity, and demand signals.
      </p>
      ${renderSyncStatus()}
      <button id="settings-full-sync" class="btn btn-primary" ${isSyncRunning() ? 'disabled' : ''}>
        ${isSyncRunning() ? 'Sync Running...' : 'Run Full Sync'}
      </button>
    </div>

    <div class="settings-section">
      <h3>Quick Sync</h3>
      <p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.75rem">
        Lightweight cache refresh from Shopify (no database writes).
      </p>
      <div class="sync-actions">
        <button id="settings-sync-products" class="btn btn-secondary">Sync Products</button>
        <button id="settings-sync-orders" class="btn btn-secondary">Sync Orders</button>
        <button id="settings-sync-inventory" class="btn btn-secondary">Sync Inventory</button>
        <button id="settings-sync-all" class="btn btn-secondary">Sync Everything</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>Cache</h3>
      <div class="cache-card">
        <div class="cache-stat">Entries: ${c?.entries || 0} (${c?.alive || 0} alive)</div>
        <button id="settings-clear-cache" class="btn btn-secondary">Clear Cache</button>
      </div>
      ${c?.stats?.length ? `
        <div class="cache-list">
          ${c.stats.map(s => `
            <div class="cache-entry ${s.alive ? '' : 'expired'}">
              <span>${s.key}</span>
              <span>${s.alive ? s.expiresIn + 's' : 'expired'}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <div class="settings-section">
      <h3>Webhooks</h3>
      <button id="settings-webhooks" class="btn btn-secondary">Setup Webhooks</button>
    </div>

    <div class="settings-section">
      <h3>Diagnostics</h3>
      <button id="settings-test-connection" class="btn btn-secondary">Test Shopify Connection</button>
      <div id="settings-diag" style="margin-top:0.5rem;font-size:0.82rem;font-family:var(--font-mono);white-space:pre-wrap"></div>
    </div>
  `;
}

function isSyncRunning() {
  const ss = state.syncStatus;
  return ss && (ss.status === 'running' || ss.status === 'starting');
}

function renderSyncStatus() {
  const ss = state.syncStatus;
  if (!ss) return '';

  if (ss.status === 'never_run') {
    return '<div class="sync-status-bar" style="margin-bottom:0.75rem;font-size:0.82rem;color:var(--text-dim)">No sync has been run yet.</div>';
  }

  if (ss.status === 'starting' || ss.status === 'running') {
    const step = ss.step || 'starting';
    const label = STEP_LABELS[step] || `${step}...`;
    const totalSteps = Object.keys(STEP_LABELS).length;
    const currentStep = syncStepIndex(step);
    const pct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
    const progress = ss.progress || '';

    return `
      <div class="sync-status-bar running" style="margin-bottom:0.75rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem">
          <span class="sync-spinner"></span>
          <span style="font-size:0.85rem;font-weight:500">${label}</span>
        </div>
        <div class="sync-progress-track">
          <div class="sync-progress-fill" style="width:${pct}%"></div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.25rem">
          Step ${currentStep}/${totalSteps}${progress ? ` — ${progress}` : ''}
        </div>
      </div>
    `;
  }

  if (ss.status === 'done') {
    const r = ss.results || {};
    return `
      <div class="sync-status-bar done" style="margin-bottom:0.75rem">
        <div style="font-size:0.85rem;font-weight:500;color:var(--success,#22c55e);margin-bottom:0.4rem">
          Sync complete ${ss.elapsed ? `(${ss.elapsed})` : ''}
        </div>
        <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.6">
          ${r.matched != null ? `Products matched: ${r.matched}` : ''}
          ${r.unmatched != null ? ` · Unmatched: ${r.unmatched}` : ''}
          ${r.mpsUpdated != null ? `<br>MPs updated: ${r.mpsUpdated}` : ''}
          ${r.stylesCreated != null ? ` · Styles: ${r.stylesCreated}` : ''}
          ${r.orders != null ? `<br>Orders fetched: ${r.orders}` : ''}
          ${r.salesStored != null ? ` · Sales stored: ${r.salesStored}` : ''}
          ${r.velocityUpdated != null ? ` · Velocity: ${r.velocityUpdated} MPs` : ''}
        </div>
        ${ss.completedAt ? `<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.3rem">Last run: ${formatDateTime(ss.completedAt)}</div>` : ''}
      </div>
    `;
  }

  if (ss.status === 'failed') {
    return `
      <div class="sync-status-bar failed" style="margin-bottom:0.75rem">
        <div style="font-size:0.85rem;font-weight:500;color:var(--danger,#ef4444);margin-bottom:0.25rem">
          Sync failed
        </div>
        <div style="font-size:0.78rem;color:var(--text-dim)">${ss.error || 'Unknown error'}</div>
        ${ss.elapsed ? `<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">After ${ss.elapsed}</div>` : ''}
      </div>
    `;
  }

  return '';
}

// ── Polling ─────────────────────────────────────────────────

function startPolling() {
  stopPolling();
  _pollTimer = setInterval(async () => {
    if (!_container) { stopPolling(); return; }
    try {
      const ss = await api.silent.get('/api/sync/status');
      state.syncStatus = ss;
      render();

      if (ss.status === 'done') {
        stopPolling();
        emit('sync:complete', { source: 'full-sync', results: ss.results });
        emit('toast:show', { message: 'Full sync complete', type: 'success' });
      } else if (ss.status === 'failed') {
        stopPolling();
        emit('toast:show', { message: `Sync failed: ${ss.error || 'unknown'}`, type: 'error' });
      }
    } catch (err) {
      // Silently continue polling on network blips
    }
  }, 3000);
}

function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

// ── Events ──────────────────────────────────────────────────

function bindEvents() {
  _container?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Full sync trigger
    if (btn.id === 'settings-full-sync') {
      btn.disabled = true;
      btn.textContent = 'Starting...';
      try {
        const r = await api.post('/api/sync/trigger');
        if (r.triggered === false) {
          emit('toast:show', { message: r.message || 'Sync already running', type: 'warning' });
        } else {
          emit('toast:show', { message: 'Full sync triggered', type: 'success' });
        }
        // Refresh status and start polling
        state.syncStatus = await api.silent.get('/api/sync/status').catch(() => state.syncStatus);
        render();
        startPolling();
      } catch (err) {
        emit('toast:show', { message: err.message, type: 'error' });
        btn.disabled = false;
        btn.textContent = 'Run Full Sync';
      }
      return;
    }

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Working...';

    try {
      if (btn.id === 'settings-clear-cache') {
        await api.post('/api/status/cache/clear');
        state.cache = await api.get('/api/status/cache');
        emit('toast:show', { message: 'Cache cleared', type: 'success' });
      } else if (btn.id === 'settings-sync-products') {
        const r = await api.post('/api/products/sync');
        emit('sync:complete', { source: 'products', count: r.count });
        emit('toast:show', { message: `Synced ${r.count} products`, type: 'success' });
      } else if (btn.id === 'settings-sync-orders') {
        const r = await api.post('/api/orders/sync');
        emit('sync:complete', { source: 'orders', count: r.count });
        emit('toast:show', { message: `Synced ${r.count} orders`, type: 'success' });
      } else if (btn.id === 'settings-sync-inventory') {
        const r = await api.post('/api/inventory/sync');
        emit('sync:complete', { source: 'inventory', count: r.locations?.length });
        emit('toast:show', { message: 'Inventory synced', type: 'success' });
      } else if (btn.id === 'settings-sync-all') {
        emit('sync:start', { source: 'all' });
        await Promise.all([
          api.post('/api/products/sync'),
          api.post('/api/orders/sync'),
          api.post('/api/inventory/sync'),
        ]);
        emit('sync:complete', { source: 'all' });
        emit('toast:show', { message: 'Full sync complete', type: 'success' });
      } else if (btn.id === 'settings-webhooks') {
        const base = window.location.origin;
        await api.post('/api/status/webhooks', { base_url: base });
        emit('toast:show', { message: 'Webhooks configured', type: 'success' });
      }
      render();
    } catch (err) {
      emit('toast:show', { message: err.message, type: 'error' });
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });
}

export function destroy() {
  stopPolling();
  _container = null;
  state = { loaded: false, status: null, cache: null, syncStatus: null };
}

// Top-level event listeners (guarded)
on('sync:complete', async () => {
  if (!_container) return;
  state.syncStatus = await api.silent.get('/api/sync/status').catch(() => state.syncStatus);
  render();
});
