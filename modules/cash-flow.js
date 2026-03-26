/**
 * Cash Flow Module — Revenue, POs with stage gates, production cost tracking
 * 
 * THE TRUNK — connects MPs (roots) to analytics (branches).
 * 
 * API endpoints:
 *   GET  /api/orders/sales           → revenue data
 *   GET  /api/products/reorder       → reorder plan (velocity + inventory)
 *   GET  /api/purchase-orders        → POs with stage gates
 *   GET  /api/purchase-orders/stages → stage definitions
 *   GET  /api/ledger                 → ledger entries
 * 
 * Publishes: po:created, po:updated
 * Subscribes: sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, formatDate, skeleton } from './core.js';

let state = {
  loaded: false,
  salesData: null,
  reorderPlan: null,
  purchaseOrders: [],
  stages: [],
  ledger: [],
  view: 'overview',
};

let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Cash Flow</h2>
      <div class="module-tabs">
        <button class="tab active" data-view="overview">Overview</button>
        <button class="tab" data-view="pos">Purchase Orders</button>
        <button class="tab" data-view="production">Production</button>
        <button class="tab" data-view="ledger">Ledger</button>
      </div>
    </div>
    <div id="cf-content">${skeleton(6)}</div>
  `;

  try {
    const [sales, pos, stages, reorder] = await Promise.allSettled([
      api.get('/api/orders/sales', { days: 30 }),
      api.get('/api/purchase-orders'),
      api.get('/api/purchase-orders/stages'),
      api.get('/api/products/reorder', { days: 30, cover: 90 }),
    ]);
    state.salesData = sales.status === 'fulfilled' ? sales.value : null;
    state.purchaseOrders = pos.status === 'fulfilled' ? (pos.value.purchaseOrders || []) : [];
    state.stages = stages.status === 'fulfilled' ? (stages.value.stages || []) : [];
    state.reorderPlan = reorder.status === 'fulfilled' ? reorder.value : null;
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('cf-content').innerHTML =
      `<div class="empty-state">Failed to load: ${err.message}</div>`;
  }

  bindEvents();
}

function render() {
  const el = document.getElementById('cf-content');
  if (!el || !state.loaded) return;

  if (state.view === 'overview') renderOverview(el);
  else if (state.view === 'pos') renderPOs(el);
  else if (state.view === 'production') renderProduction(el);
  else if (state.view === 'ledger') renderLedger(el);
}

function renderOverview(el) {
  const s = state.salesData;
  const activePOs = state.purchaseOrders.filter(po => !['Received', 'Distribution'].includes(po.stage));
  const totalPOCost = activePOs.reduce((sum, po) => sum + (po.fobTotal || 0), 0);
  const totalPOUnits = activePOs.reduce((sum, po) => sum + (po.units || 0), 0);

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Revenue (30d)</div>
        <div class="stat-value">${formatCurrency(s?.totalRevenue || 0)}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">${formatNumber(s?.totalOrders || 0)} orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active PO Cost</div>
        <div class="stat-value">${formatCurrency(totalPOCost)}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">${activePOs.length} POs · ${formatNumber(totalPOUnits)} units</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Order Value</div>
        <div class="stat-value">${formatCurrency(s?.avgOrderValue || 0)}</div>
      </div>
    </div>

    ${s?.dailySales?.length ? `
      <h3>Daily Revenue — Last 30 Days</h3>
      <div class="daily-chart" style="margin-bottom:1.5rem">
        ${s.dailySales.map(d => {
          const maxRev = Math.max(...s.dailySales.map(x => x.revenue || 0), 1);
          return `
            <div class="daily-bar" title="${d.date}: ${formatCurrency(d.revenue || 0)}">
              <div class="bar-fill" style="height:${Math.max(2, ((d.revenue || 0) / maxRev) * 100)}%"></div>
              <div class="bar-label">${(d.date || '').slice(5)}</div>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    ${activePOs.length ? `
      <h3>Active Purchase Orders</h3>
      <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);overflow:hidden">
        ${activePOs.slice(0, 10).map(po => `
          <div class="po-card">
            <div class="po-vendor">${po.vendor || '—'}</div>
            <div class="po-product">${po.mpName || po.mpCode || '—'}</div>
            <div class="po-cost">${formatCurrency(po.fobTotal || 0)}</div>
            <div class="po-stage badge">${po.stage || 'Concept'}</div>
            <div class="po-date">${po.etd ? formatDate(po.etd) : '—'}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function renderPOs(el) {
  const pos = state.purchaseOrders;

  el.innerHTML = `
    <div class="po-header">
      <h3>Purchase Orders (${pos.length})</h3>
    </div>
    ${pos.length === 0
      ? '<div class="empty-state">No purchase orders yet</div>'
      : `<div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);overflow:hidden">
          <table class="data-table">
            <thead><tr>
              <th>ID</th><th>Product</th><th>Vendor</th><th>Units</th><th>FOB Total</th><th>Stage</th><th>ETD</th>
            </tr></thead>
            <tbody>
              ${pos.map(po => {
                const stageIdx = state.stages.findIndex(s => s.name === po.stage);
                const progress = state.stages.length ? Math.round(((stageIdx + 1) / state.stages.length) * 100) : 0;
                const hasGate = state.stages[stageIdx]?.gate;
                return `
                  <tr>
                    <td style="font-family:var(--font-mono);font-size:0.8rem">${po.id}</td>
                    <td>${po.mpName || po.mpCode || '—'}</td>
                    <td>${po.vendor || '—'}</td>
                    <td style="text-align:right">${formatNumber(po.units || 0)}</td>
                    <td style="text-align:right">${formatCurrency(po.fobTotal || 0)}</td>
                    <td>
                      <span class="badge">${po.stage || 'Concept'}</span>
                      ${hasGate ? `<span style="font-size:0.65rem;color:var(--text-dim);margin-left:4px">${hasGate.toUpperCase()}</span>` : ''}
                    </td>
                    <td style="font-size:0.8rem;color:var(--text-dim)">${po.etd ? formatDate(po.etd) : '—'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>`
    }
  `;
}

function renderProduction(el) {
  const r = state.reorderPlan;
  if (!r) {
    el.innerHTML = '<div class="empty-state">Loading reorder plan...</div>';
    return;
  }

  const plan = r.plan || [];
  const reorderItems = plan.filter(p => p.needsReorder);

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Need Reorder</div>
        <div class="stat-value" style="${reorderItems.length > 0 ? 'color:var(--danger)' : ''}">${reorderItems.length}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">of ${plan.length} MPs</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Reorder Cost</div>
        <div class="stat-value">${formatCurrency(r.summary?.totalReorderCost || 0)}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">${formatNumber(r.summary?.totalReorderUnits || 0)} units</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Days of Stock</div>
        <div class="stat-value">${r.summary?.avgDaysOfStock || 0}</div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">target: ${r.coverDays}d</div>
      </div>
    </div>

    ${reorderItems.length > 0 ? `
      <h3 style="color:var(--danger)">Reorder Now</h3>
      <table class="data-table" style="margin-bottom:1.5rem">
        <thead><tr>
          <th>Product</th><th>Vendor</th>
          <th style="text-align:right">Stock</th>
          <th style="text-align:right">Days Left</th>
          <th style="text-align:right">Units/Day</th>
          <th style="text-align:right">Order Qty</th>
          <th style="text-align:right">Cost</th>
        </tr></thead>
        <tbody>
          ${reorderItems.map(p => `
            <tr>
              <td style="font-weight:600">${p.name}</td>
              <td style="font-size:0.8rem;color:var(--text-dim)">${p.vendor || '—'}</td>
              <td style="text-align:right;font-family:var(--font-mono);${p.currentStock === 0 ? 'color:var(--danger);font-weight:600' : ''}">${formatNumber(p.currentStock)}</td>
              <td style="text-align:right;font-family:var(--font-mono);color:var(--danger);font-weight:600">${p.daysOfStock}</td>
              <td style="text-align:right;font-family:var(--font-mono)">${p.unitsPerDay}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatNumber(p.suggestedQty)}</td>
              <td style="text-align:right">${formatCurrency(p.suggestedCost)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <h3>All Products — Stock Status</h3>
    <table class="data-table">
      <thead><tr>
        <th>Product</th><th>Category</th>
        <th style="text-align:right">Stock</th>
        <th style="text-align:right">Days Left</th>
        <th style="text-align:right">Sold (${r.days}d)</th>
        <th style="text-align:right">Revenue</th>
      </tr></thead>
      <tbody>
        ${plan.slice(0, 40).map(p => {
          const stockColor = p.daysOfStock === 0 ? 'color:var(--danger);font-weight:600'
            : p.daysOfStock < 30 ? 'color:#b38600;font-weight:600'
            : p.daysOfStock >= 999 ? 'color:var(--text-dim)' : '';
          return `
            <tr>
              <td style="font-weight:600">${p.name}</td>
              <td style="font-size:0.8rem;color:var(--text-dim)">${p.cat}</td>
              <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(p.currentStock)}</td>
              <td style="text-align:right;font-family:var(--font-mono);${stockColor}">${p.daysOfStock >= 999 ? '∞' : p.daysOfStock}</td>
              <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(p.unitsSold)}</td>
              <td style="text-align:right">${formatCurrency(p.revenue)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderLedger(el) {
  if (state.ledger.length === 0 && state.loaded) {
    // Lazy load ledger
    api.get('/api/ledger', { days: 30 }).then(data => {
      state.ledger = data.ledger || [];
      renderLedger(el);
    }).catch(() => {
      el.innerHTML = '<div class="empty-state">Failed to load ledger</div>';
    });
    el.innerHTML = skeleton(8);
    return;
  }

  el.innerHTML = `
    <h3>Ledger Entries (${state.ledger.length})</h3>
    <table class="data-table">
      <thead><tr><th>Date</th><th>Order</th><th>Customer</th>
        <th style="text-align:right">Subtotal</th>
        <th style="text-align:right">Tax</th>
        <th style="text-align:right">Total</th></tr></thead>
      <tbody>
        ${state.ledger.map(e => `
          <tr>
            <td>${formatDate(e.date)}</td>
            <td style="font-family:var(--font-mono);font-size:0.8rem">${e.orderName || '—'}</td>
            <td>${e.customer || 'Guest'}</td>
            <td style="text-align:right">${formatCurrency(e.subtotal || 0)}</td>
            <td style="text-align:right">${formatCurrency(e.tax || 0)}</td>
            <td style="text-align:right;font-weight:600">${formatCurrency(e.total || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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

on('sync:complete', async () => {
  if (!_container) return;
  try {
    const [sales, pos] = await Promise.all([
      api.get('/api/orders/sales', { days: 30 }),
      api.get('/api/purchase-orders'),
    ]);
    state.salesData = sales;
    state.purchaseOrders = pos.purchaseOrders || [];
    render();
  } catch (e) { /* ignore */ }
});

export function destroy() {
  _container = null;
  state = { loaded: false, salesData: null, reorderPlan: null, purchaseOrders: [], stages: [], ledger: [], view: 'overview' };
}
