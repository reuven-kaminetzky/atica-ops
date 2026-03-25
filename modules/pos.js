/**
 * POS Module — Point of Sale, Sales Feed, Daily Summary
 * Owner: Deshawn
 * 
 * API endpoints:
 *   GET /api/pos/today       → today's sales
 *   GET /api/pos/by-location → sales by store
 *   GET /api/pos/feed        → transaction feed
 * 
 * Publishes: order:new, sale:complete
 * Subscribes: stock:updated, sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, timeAgo, skeleton } from './core.js';

let state = { loaded: false, today: null, feed: [], view: 'overview' };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Point of Sale</h2>
      <div class="module-tabs">
        <button class="tab active" data-view="overview">Overview</button>
        <button class="tab" data-view="feed">Feed</button>
        <button class="tab" data-view="stores">By Store</button>
      </div>
    </div>
    <div id="pos-content">${skeleton(6)}</div>
  `;

  try {
    const [today, feed] = await Promise.all([
      api.get('/api/pos/today'),
      api.get('/api/pos/feed', { limit: 30 }),
    ]);
    state.today = today;
    state.feed = feed.transactions || [];
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('pos-content').innerHTML =
      `<div class="empty-state">Failed to load POS data: ${err.message}</div>`;
  }

  bindEvents();
}

function render() {
  const el = document.getElementById('pos-content');
  if (!el || !state.loaded) return;

  const t = state.today;

  if (state.view === 'overview') {
    el.innerHTML = `
      <div class="stat-row">
        <div class="stat-card"><div class="stat-label">Revenue Today</div><div class="stat-value">${formatCurrency(t?.totalRevenue || 0)}</div></div>
        <div class="stat-card"><div class="stat-label">Orders</div><div class="stat-value">${formatNumber(t?.totalOrders || 0)}</div></div>
        <div class="stat-card"><div class="stat-label">Units Sold</div><div class="stat-value">${formatNumber(t?.totalUnits || 0)}</div></div>
      </div>
      <h3>Recent Transactions</h3>
      ${renderTransactionList(state.feed.slice(0, 10))}
    `;
  } else if (state.view === 'feed') {
    el.innerHTML = renderTransactionList(state.feed);
  } else if (state.view === 'stores') {
    const stores = t?.byStore || [];
    el.innerHTML = `
      <div class="store-grid">
        ${stores.map(s => `
          <div class="store-card">
            <div class="store-name">${s.store}</div>
            <div class="store-revenue">${formatCurrency(s.revenue)}</div>
            <div class="store-meta">${s.orders} orders · ${s.units} units</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function renderTransactionList(txs) {
  return `<div class="transaction-list">
    ${txs.map(tx => `
      <div class="transaction-row">
        <span class="tx-name">${tx.name}</span>
        <span class="tx-customer">${tx.customer}</span>
        <span class="tx-store">${tx.store}</span>
        <span class="tx-total">${formatCurrency(tx.total)}</span>
        <span class="tx-time">${timeAgo(tx.createdAt)}</span>
      </div>
    `).join('')}
  </div>`;
}

function bindEvents() {
  _container?.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.view = tab.dataset.view;
      render();
    });
  });
}

on('stock:updated', () => { /* TODO: refresh stock warnings inline */ });
on('sync:complete', async () => {
  if (!_container) return;
  state.today = await api.get('/api/pos/today');
  render();
});

export function destroy() { _container = null; state = { loaded: false, today: null, feed: [], view: 'overview' }; }
