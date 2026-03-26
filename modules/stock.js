/**
 * Stock Module — Inventory grouped by Master Product and location
 * 
 * Not raw Shopify inventory items. Grouped by MP because that's
 * how you think about stock — "how many Londoner shirts do we have?"
 * not "how many units of inventory_item_id 45839201?"
 * 
 * API endpoints:
 *   GET /api/products/masters  → MPs with totalInventory
 *   GET /api/inventory         → raw inventory by location
 * 
 * Subscribes: sync:complete, po:received
 */

import { on, emit } from './event-bus.js';
import { api, formatNumber, skeleton } from './core.js';

let state = {
  loaded: false,
  masters: [],
  locations: [],
  view: 'by-mp',
  filter: '',
};
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Stock</h2>
      <div class="module-actions">
        <input type="text" id="stock-search" placeholder="Search..." class="input-search" />
        <div class="module-tabs" style="margin-left:0.5rem">
          <button class="tab active" data-view="by-mp">By Product</button>
          <button class="tab" data-view="by-location">By Location</button>
        </div>
      </div>
    </div>
    <div id="stock-content">${skeleton(8)}</div>
  `;

  try {
    const [masters, inv] = await Promise.all([
      api.get('/api/products/masters'),
      api.get('/api/inventory'),
    ]);
    state.masters = masters.masters || [];
    state.locations = inv.locations || [];
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('stock-content').innerHTML =
      `<div class="empty-state">Failed to load stock: ${err.message}</div>`;
  }

  bindEvents();
}

function render() {
  const el = document.getElementById('stock-content');
  if (!el || !state.loaded) return;

  if (state.view === 'by-mp') renderByMP(el);
  else renderByLocation(el);
}

function renderByMP(el) {
  let mps = state.masters;
  if (state.filter) {
    const q = state.filter.toLowerCase();
    mps = mps.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q) ||
      m.cat.toLowerCase().includes(q)
    );
  }

  // Sort by inventory (lowest first — that's what needs attention)
  const sorted = [...mps].sort((a, b) => a.totalInventory - b.totalInventory);

  const totalUnits = mps.reduce((s, m) => s + (m.totalInventory || 0), 0);
  const zeroStock = mps.filter(m => (m.totalInventory || 0) === 0).length;
  const lowStock = mps.filter(m => (m.totalInventory || 0) > 0 && (m.totalInventory || 0) < 20).length;

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Units</div>
        <div class="stat-value">${formatNumber(totalUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Master Products</div>
        <div class="stat-value">${mps.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Out of Stock</div>
        <div class="stat-value" style="color:var(--danger)">${zeroStock}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Low Stock (&lt;20)</div>
        <div class="stat-value" style="color:var(--warning)">${lowStock}</div>
      </div>
    </div>

    <table class="data-table">
      <thead><tr>
        <th>Product</th><th>Code</th><th>Category</th>
        <th style="text-align:right">Total Units</th>
        <th style="text-align:right">Styles</th>
        <th style="text-align:right">Variants</th>
        <th>Status</th>
      </tr></thead>
      <tbody>
        ${sorted.map(mp => {
          const qty = mp.totalInventory || 0;
          const statusClass = qty === 0 ? 'color:var(--danger);font-weight:600'
            : qty < 20 ? 'color:#b38600;font-weight:600'
            : 'color:var(--success)';
          const statusLabel = qty === 0 ? 'OUT' : qty < 20 ? 'LOW' : 'OK';
          return `
            <tr>
              <td style="font-weight:600">${mp.name}</td>
              <td style="font-family:var(--font-mono);font-size:0.8rem">${mp.code}</td>
              <td style="font-size:0.8rem;color:var(--text-dim)">${mp.cat}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatNumber(qty)}</td>
              <td style="text-align:right">${mp.styleCount || 0}</td>
              <td style="text-align:right">${mp.variantCount || 0}</td>
              <td><span style="${statusClass};font-size:0.75rem">${statusLabel}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderByLocation(el) {
  const locs = state.locations;
  const totalUnits = locs.reduce((s, loc) =>
    s + loc.levels.reduce((a, l) => a + (l.available || 0), 0), 0);

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Units</div>
        <div class="stat-value">${formatNumber(totalUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Locations</div>
        <div class="stat-value">${locs.length}</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:1rem">
      ${locs.map(loc => {
        const locTotal = loc.levels.reduce((s, l) => s + (l.available || 0), 0);
        const skus = loc.levels.length;
        const outOfStock = loc.levels.filter(l => (l.available || 0) <= 0).length;
        return `
          <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:1rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
              <div style="font-weight:600">${loc.locationName}</div>
              <div style="font-family:var(--font-mono);font-weight:600">${formatNumber(locTotal)} units</div>
            </div>
            <div style="font-size:0.78rem;color:var(--text-dim)">
              ${skus} SKUs · ${outOfStock} out of stock
            </div>
            <div style="margin-top:0.5rem;height:6px;background:var(--border-light);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${totalUnits > 0 ? (locTotal / totalUnits * 100) : 0}%;background:var(--primary);border-radius:3px"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
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

  const search = document.getElementById('stock-search');
  if (search) {
    search.addEventListener('input', (e) => {
      state.filter = e.target.value;
      render();
    });
  }
}

on('sync:complete', async () => {
  if (!_container) return;
  try {
    const [masters, inv] = await Promise.all([
      api.get('/api/products/masters'),
      api.get('/api/inventory'),
    ]);
    state.masters = masters.masters || [];
    state.locations = inv.locations || [];
    render();
    emit('stock:updated', { locations: state.locations });
  } catch (e) { /* ignore */ }
});

on('po:received', async () => {
  if (!_container) return;
  try {
    const inv = await api.get('/api/inventory');
    state.locations = inv.locations || [];
    render();
  } catch (e) { /* ignore */ }
});

export function destroy() {
  _container = null;
  state = { loaded: false, masters: [], locations: [], view: 'by-mp', filter: '' };
}
