/**
 * Stock Module — Inventory levels by location, transfers, reorder
 * Owner: Shrek
 * 
 * API endpoints:
 *   GET  /api/inventory        → all locations + levels
 *   POST /api/inventory/adjust → adjust stock
 *   GET  /api/products         → product details for mapping
 * 
 * Publishes: stock:updated, stock:low, stock:transfer
 * Subscribes: po:received, order:new, sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatNumber, skeleton } from './core.js';

let state = { loaded: false, locations: [], products: [], view: 'overview' };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Stock</h2>
      <div class="module-tabs">
        <button class="tab active" data-view="overview">Overview</button>
        <button class="tab" data-view="by-location">By Location</button>
        <button class="tab" data-view="transfer">Transfer</button>
      </div>
    </div>
    <div id="stock-content">${skeleton(6)}</div>
  `;

  try {
    const [inv, prod] = await Promise.all([
      api.get('/api/inventory'),
      api.get('/api/products'),
    ]);
    state.locations = inv.locations || [];
    state.products = prod.products || [];
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

  if (state.view === 'overview') {
    const totalUnits = state.locations.reduce((sum, loc) =>
      sum + loc.levels.reduce((s, l) => s + (l.available || 0), 0), 0);
    el.innerHTML = `
      <div class="stat-row">
        <div class="stat-card"><div class="stat-label">Total Units</div><div class="stat-value">${formatNumber(totalUnits)}</div></div>
        <div class="stat-card"><div class="stat-label">Locations</div><div class="stat-value">${state.locations.length}</div></div>
        <div class="stat-card"><div class="stat-label">Products</div><div class="stat-value">${state.products.length}</div></div>
      </div>
      <h3>Stock by Location</h3>
      ${state.locations.map(loc => `
        <div class="location-card">
          <div class="loc-name">${loc.locationName}</div>
          <div class="loc-units">${formatNumber(loc.levels.reduce((s, l) => s + (l.available || 0), 0))} units</div>
          <div class="loc-skus">${loc.levels.length} SKUs</div>
        </div>
      `).join('')}
    `;
  } else if (state.view === 'by-location') {
    el.innerHTML = state.locations.map(loc => `
      <div class="location-section">
        <h3>${loc.locationName} (${loc.levels.length} SKUs)</h3>
        <div class="level-list">
          ${loc.levels.slice(0, 20).map(l => `
            <div class="level-row">
              <span class="level-item">${l.inventoryItemId}</span>
              <span class="level-qty ${l.available <= 0 ? 'out-of-stock' : ''}">${l.available}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  } else if (state.view === 'transfer') {
    el.innerHTML = `<div class="empty-state">Transfer UI coming soon — Shrek, build this out</div>`;
  }
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

on('po:received', () => { /* TODO: refresh inventory after PO received */ });
on('order:new', () => { /* TODO: decrement stock counts */ });
on('sync:complete', async () => {
  if (!_container) return;
  const inv = await api.get('/api/inventory');
  state.locations = inv.locations || [];
  render();
  emit('stock:updated', { locations: state.locations });
});

export function destroy() { _container = null; state = { loaded: false, locations: [], products: [], view: 'overview' }; }
