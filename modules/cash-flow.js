/**
 * Cash Flow Module — POs, Cost tracking, Revenue vs Costs, Forecasting
 * Owner: Deshawn
 * 
 * API endpoints:
 *   GET  /api/orders/sales    → revenue data
 *   GET  /api/ledger          → ledger entries
 *   GET  /api/pos/by-location → revenue by store
 * 
 * Publishes: po:created, po:updated, po:received
 * Subscribes: order:new, product:costUpdated, stock:low
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatDate, skeleton } from './core.js';

let state = {
  loaded: false,
  salesData: null,
  ledger: [],
  purchaseOrders: [],
  view: 'overview',
};

let _container = null;

// ── Init ────────────────────────────────────────────────────

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Cash Flow</h2>
      <div class="module-tabs">
        <button class="tab active" data-view="overview">Overview</button>
        <button class="tab" data-view="pos">Purchase Orders</button>
        <button class="tab" data-view="ledger">Ledger</button>
      </div>
    </div>
    <div id="cf-content">${skeleton(6)}</div>
  `;

  try {
    const [sales, ledger, posData] = await Promise.all([
      api.get('/api/orders/sales', { days: 30 }),
      api.get('/api/ledger', { days: 30 }),
      api.get('/api/purchase-orders'),
    ]);
    state.salesData = sales;
    state.ledger = ledger.ledger || [];
    state.purchaseOrders = posData.purchaseOrders || [];
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('cf-content').innerHTML =
      `<div class="empty-state">Failed to load cash flow data: ${err.message}</div>`;
  }

  bindEvents();
}

// ── Render ──────────────────────────────────────────────────

function render() {
  const el = document.getElementById('cf-content');
  if (!el || !state.loaded) return;

  if (state.view === 'overview') {
    const s = state.salesData;
    const totalPOCost = state.purchaseOrders.reduce((sum, po) => sum + ((po.fob || 0) * (po.units || 0)), 0);
    el.innerHTML = `
      <div class="stat-row">
        <div class="stat-card"><div class="stat-label">Revenue (30d)</div><div class="stat-value">${formatCurrency(s?.totalRevenue || 0)}</div></div>
        <div class="stat-card"><div class="stat-label">PO Costs</div><div class="stat-value">${formatCurrency(totalPOCost)}</div></div>
        <div class="stat-card"><div class="stat-label">Gross Margin</div><div class="stat-value">${formatCurrency((s?.totalRevenue || 0) - totalPOCost)}</div></div>
        <div class="stat-card"><div class="stat-label">Avg Order</div><div class="stat-value">${formatCurrency(s?.avgOrderValue || 0)}</div></div>
      </div>
      <h3>Daily Revenue</h3>
      <div class="daily-chart">
        ${(s?.dailySales || []).map(d => `
          <div class="daily-bar" title="${d.date}: ${formatCurrency(d.revenue)}">
            <div class="bar-fill" style="height:${Math.min(100, (d.revenue / (s.totalRevenue / (s.days || 1))) * 50)}%"></div>
            <div class="bar-label">${d.date.slice(5)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (state.view === 'pos') {
    el.innerHTML = `
      <div class="po-header">
        <h3>Purchase Orders (${state.purchaseOrders.length})</h3>
        <button id="cf-new-po" class="btn btn-primary">+ New PO</button>
      </div>
      <div class="po-list">
        ${state.purchaseOrders.length === 0
          ? '<div class="empty-state">No purchase orders yet</div>'
          : state.purchaseOrders.map(po => `
            <div class="po-card" data-id="${po.id}">
              <div class="po-vendor">${po.vendor || 'Unknown'}</div>
              <div class="po-product">${po.mpName || po.mpId || '—'}</div>
              <div class="po-cost">${formatCurrency((po.fob || 0) * (po.units || 0))}</div>
              <div class="po-stage badge">${po.stage || 'draft'}</div>
              <div class="po-date">${po._updatedAt ? formatDate(po._updatedAt) : '—'}</div>
            </div>
          `).join('')}
      </div>
    `;
  } else if (state.view === 'ledger') {
    el.innerHTML = `
      <h3>Ledger Entries (${state.ledger.length})</h3>
      <table class="data-table">
        <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Subtotal</th><th>Tax</th><th>Total</th></tr></thead>
        <tbody>
          ${state.ledger.map(e => `
            <tr>
              <td>${e.date}</td><td>${e.orderName}</td><td>${e.customer}</td>
              <td>${formatCurrency(e.subtotal)}</td><td>${formatCurrency(e.tax)}</td><td>${formatCurrency(e.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

// ── Events ──────────────────────────────────────────────────

function bindEvents() {
  _container?.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.view = tab.dataset.view;
      render();
      // Re-bind PO buttons after render
      const newPO = document.getElementById('cf-new-po');
      if (newPO) newPO.addEventListener('click', createPO);
    });
  });
}

function createPO() {
  // TODO: Open modal for new PO creation
  emit('modal:open', { title: 'New Purchase Order', content: 'PO form coming soon' });
}

on('order:new', (order) => {
  // New sale came in — refresh revenue
  if (state.salesData) {
    state.salesData.totalRevenue += parseFloat(order.totalPrice || 0);
    state.salesData.totalOrders++;
    render();
  }
});

on('product:costUpdated', ({ productId, cost }) => {
  // TODO: Update PO cost calculations
  console.log('[cash-flow] Product cost updated:', productId, cost);
});

on('stock:low', (data) => {
  // TODO: Flag for reorder in PO view
  console.log('[cash-flow] Stock low alert:', data);
});

export function destroy() {
  _container = null;
  state = { loaded: false, salesData: null, ledger: [], purchaseOrders: [], view: 'overview' };
}
