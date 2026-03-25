/**
 * Settings Module — Connection status, sync controls, cache management
 * Owner: Stallon
 * 
 * API endpoints:
 *   GET  /api/status           → Shopify connection check
 *   GET  /api/status/cache     → cache stats
 *   POST /api/status/cache/clear → clear cache
 *   POST /api/status/webhooks  → setup webhooks
 */

import { on, emit } from './event-bus.js';
import { api, skeleton } from './core.js';

let state = { loaded: false, status: null, cache: null };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Settings</h2>
    </div>
    <div id="settings-content">${skeleton(4)}</div>
  `;

  try {
    const [status, cache] = await Promise.all([
      api.get('/api/status'),
      api.get('/api/status/cache'),
    ]);
    state.status = status;
    state.cache = cache;
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('settings-content').innerHTML =
      `<div class="empty-state">Failed to load settings: ${err.message}</div>`;
  }

  bindEvents();
}

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
        ` : `<div class="conn-detail">${s?.message || 'Not connected'}</div>`}
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
      <h3>Sync All</h3>
      <div class="sync-actions">
        <button id="settings-sync-products" class="btn btn-secondary">Sync Products</button>
        <button id="settings-sync-orders" class="btn btn-secondary">Sync Orders</button>
        <button id="settings-sync-inventory" class="btn btn-secondary">Sync Inventory</button>
        <button id="settings-sync-all" class="btn btn-primary">Sync Everything</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>Webhooks</h3>
      <button id="settings-webhooks" class="btn btn-secondary">Setup Webhooks</button>
    </div>
  `;
}

function bindEvents() {
  _container?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

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

export function destroy() { _container = null; state = { loaded: false, status: null, cache: null }; }
