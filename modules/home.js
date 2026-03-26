/**
 * Home Module — Dashboard overview
 * 
 * API endpoints:
 *   GET /api/pos/today       → today's revenue + store breakdown
 *   GET /api/orders/sales    → 30-day revenue trend
 *   GET /api/status          → Shopify connection
 *   GET /api/purchase-orders → open POs
 *
 * Subscribes: sync:complete, order:new
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, timeAgo, skeleton } from './core.js';

let state = { loaded: false, today: null, sales: null, status: null, pos: [] };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Overview</h2>
      <div class="module-actions">
        <button id="home-sync" class="btn btn-secondary">↻ Sync</button>
      </div>
    </div>
    <div id="home-content">${skeleton(8)}</div>
  `;

  try {
    const [today, sales, status, posData] = await Promise.allSettled([
      api.get('/api/pos/today'),
      api.get('/api/orders/sales', { days: 30 }),
      api.get('/api/status'),
      api.get('/api/purchase-orders'),
    ]);
    state.today = today.status === 'fulfilled' ? today.value : null;
    state.sales = sales.status === 'fulfilled' ? sales.value : null;
    state.status = status.status === 'fulfilled' ? status.value : null;
    state.pos = posData.status === 'fulfilled' ? (posData.value.purchaseOrders || []) : [];
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('home-content').innerHTML =
      `<div class="empty-state">Failed to load dashboard: ${err.message}</div>`;
  }

  bindEvents();
}

function render() {
  const el = document.getElementById('home-content');
  if (!el || !state.loaded) return;

  const t = state.today;
  const s = state.sales;
  const openPOs = state.pos.filter(po => po.stage !== 'complete' && po.stage !== 'cancelled');
  const stores = t?.byStore || [];

  el.innerHTML = `
    ${state.status?.connected ? '' : `
      <div style="background:var(--warning-bg);border:1px solid rgba(255,193,7,.3);border-radius:var(--radius);padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.85rem">
        ⚠ Shopify not connected — ${state.status?.message || 'check settings'}
      </div>
    `}

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Today's Revenue</div>
        <div class="stat-value">${formatCurrency(t?.totalRevenue || 0)}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">${formatNumber(t?.totalOrders || 0)} orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">30-Day Revenue</div>
        <div class="stat-value">${formatCurrency(s?.totalRevenue || 0)}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">${formatNumber(s?.totalOrders || 0)} orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Order</div>
        <div class="stat-value">${formatCurrency(s?.avgOrderValue || 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Open POs</div>
        <div class="stat-value">${openPOs.length}</div>
      </div>
    </div>

    ${stores.length ? `
      <h3>Stores — Today</h3>
      <div class="store-grid" style="margin-bottom:1.5rem">
        ${stores.map(st => `
          <div class="store-card">
            <div class="store-name">${st.store}</div>
            <div class="store-revenue">${formatCurrency(st.revenue)}</div>
            <div class="store-meta">${st.orders} orders · ${st.units} units</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${s?.dailySales?.length ? `
      <h3>Daily Revenue — Last 30 Days</h3>
      <div class="daily-chart" style="margin-bottom:1.5rem">
        ${s.dailySales.map(d => {
          const maxRev = Math.max(...s.dailySales.map(x => x.revenue || 0), 1);
          const pct = ((d.revenue || 0) / maxRev) * 100;
          return `
            <div class="daily-bar" title="${d.date}: ${formatCurrency(d.revenue || 0)}">
              <div class="bar-fill" style="height:${Math.max(2, pct)}%"></div>
              <div class="bar-label">${(d.date || '').slice(5)}</div>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    ${openPOs.length ? `
      <h3>Active Purchase Orders</h3>
      <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);overflow:hidden">
        ${openPOs.slice(0, 8).map(po => `
          <div class="po-card">
            <div class="po-vendor">${po.vendor || 'Unknown'}</div>
            <div class="po-product">${po.mpName || po.mpId || '—'}</div>
            <div class="po-cost">${formatCurrency(po.fobTotal || (po.fob || 0) * (po.units || 0))}</div>
            <div class="po-stage badge">${po.stage || 'draft'}</div>
            <div class="po-date">${po._updatedAt ? timeAgo(po._updatedAt) : '—'}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function bindEvents() {
  const syncBtn = document.getElementById('home-sync');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      emit('sync:start', { source: 'home' });
      try {
        await Promise.all([
          api.post('/api/products/sync'),
          api.post('/api/orders/sync'),
        ]);
        state.today = await api.get('/api/pos/today');
        state.sales = await api.get('/api/orders/sales', { days: 30 });
        render();
        emit('sync:complete', { source: 'home' });
        emit('toast:show', { message: 'Synced', type: 'success' });
      } catch (err) {
        emit('sync:error', { source: 'home', error: err.message });
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = '↻ Sync';
      }
    });
  }
}

on('sync:complete', async () => {
  if (!_container) return;
  try {
    state.today = await api.get('/api/pos/today');
    render();
  } catch (e) { /* ignore */ }
});

export function destroy() {
  _container = null;
  state = { loaded: false, today: null, sales: null, status: null, pos: [] };
}
