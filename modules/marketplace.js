/**
 * Marketplace Module — Master Products, Styles, Vendors
 * Owner: Shrek
 * 
 * API endpoints used:
 *   GET  /api/products          → product list
 *   GET  /api/products/sku-map  → SKU mapping
 *   GET  /api/inventory         → stock levels (read-only)
 * 
 * Events published:
 *   product:updated      → when product data changes
 *   product:costUpdated  → when cost is edited
 * 
 * Events subscribed:
 *   order:synced    → update sell-through counts
 *   stock:updated   → refresh stock badges
 *   po:received     → update incoming stock
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, skeleton, html } from './core.js';

// ── State (private) ─────────────────────────────────────────

let state = {
  loaded: false,
  products: [],
  filter: '',
  view: 'grid', // 'grid' | 'list'
};

let _container = null;

// ── Init ────────────────────────────────────────────────────

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Marketplace</h2>
      <div class="module-actions">
        <input type="text" id="mp-search" placeholder="Search products..." class="input-search" />
        <button id="mp-sync" class="btn btn-secondary">Sync</button>
      </div>
    </div>
    <div id="mp-content">${skeleton(8)}</div>
  `;

  try {
    const data = await api.get('/api/products');
    state.products = data.products || [];
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('mp-content').innerHTML = `
      <div class="empty-state">Failed to load products: ${err.message}</div>
    `;
  }

  bindEvents();
}

// ── Render ──────────────────────────────────────────────────

function render() {
  const content = document.getElementById('mp-content');
  if (!content) return;

  const filtered = state.filter
    ? state.products.filter(p =>
        p.title.toLowerCase().includes(state.filter.toLowerCase()) ||
        p.vendor.toLowerCase().includes(state.filter.toLowerCase())
      )
    : state.products;

  if (filtered.length === 0) {
    content.innerHTML = `<div class="empty-state">No products found</div>`;
    return;
  }

  content.innerHTML = `
    <div class="product-grid">
      ${filtered.map(p => `
        <div class="product-card" data-id="${p.shopifyId}">
          ${p.images[0] ? `<img src="${p.images[0].src}&width=200" class="product-img" />` : '<div class="product-img-placeholder">No image</div>'}
          <div class="product-info">
            <div class="product-title">${p.title}</div>
            <div class="product-meta">${p.vendor} · ${p.variants.length} variants</div>
            <div class="product-price">${formatCurrency(p.variants[0]?.price || 0)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Events ──────────────────────────────────────────────────

function bindEvents() {
  const search = document.getElementById('mp-search');
  if (search) {
    search.addEventListener('input', (e) => {
      state.filter = e.target.value;
      render();
    });
  }

  const syncBtn = document.getElementById('mp-sync');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      emit('sync:start', { source: 'marketplace' });
      try {
        const data = await api.post('/api/products/sync');
        state.products = data.products || [];
        render();
        emit('sync:complete', { source: 'marketplace', count: state.products.length });
        emit('toast:show', { message: `Synced ${state.products.length} products`, type: 'success' });
      } catch (err) {
        emit('sync:error', { source: 'marketplace', error: err.message });
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync';
      }
    });
  }
}

// ── Subscriptions ───────────────────────────────────────────

on('order:synced', (data) => {
  // TODO: Update sell-through counts on product cards
  console.log('[marketplace] Orders synced, update sell-through');
});

on('stock:updated', (data) => {
  // TODO: Refresh stock badges on product cards
  console.log('[marketplace] Stock updated, refresh badges');
});

on('po:received', (data) => {
  // TODO: Show incoming stock on relevant products
  console.log('[marketplace] PO received, update incoming');
});

// ── Cleanup ─────────────────────────────────────────────────

export function destroy() {
  _container = null;
  state = { loaded: false, products: [], filter: '', view: 'grid' };
}
