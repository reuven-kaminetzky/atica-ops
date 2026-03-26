/**
 * Marketplace Module — Master Products with real Shopify data
 * 
 * Shows MPs grouped by category, enriched with live styles,
 * inventory, pricing, and images from Shopify.
 * 
 * API: GET /api/products/masters
 * 
 * Publishes: product:updated
 * Subscribes: sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, skeleton } from './core.js';

let state = { loaded: false, masters: [], unmatched: [], categories: [], filter: '', activeCat: null };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Master Products</h2>
      <div class="module-actions">
        <input type="text" id="mp-search" placeholder="Search MPs..." class="input-search" />
        <button id="mp-sync" class="btn btn-secondary">Sync</button>
      </div>
    </div>
    <div id="mp-cats"></div>
    <div id="mp-content">${skeleton(8)}</div>
  `;

  try {
    const data = await api.get('/api/products/masters');
    state.masters = data.masters || [];
    state.unmatched = data.unmatched || [];
    state.categories = data.categories || [];
    state.loaded = true;
    renderCats();
    render();
  } catch (err) {
    document.getElementById('mp-content').innerHTML =
      `<div class="empty-state">Failed to load products: ${err.message}</div>`;
  }

  bindEvents();
}

function renderCats() {
  const el = document.getElementById('mp-cats');
  if (!el) return;

  const counts = {};
  for (const m of state.masters) counts[m.cat] = (counts[m.cat] || 0) + 1;

  el.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:1rem;flex-wrap:wrap">
      <button class="tab ${!state.activeCat ? 'active' : ''}" data-cat="">All (${state.masters.length})</button>
      ${state.categories.filter(c => counts[c]).map(cat => `
        <button class="tab ${state.activeCat === cat ? 'active' : ''}" data-cat="${cat}">${cat} (${counts[cat] || 0})</button>
      `).join('')}
      ${state.unmatched.length ? `<span style="font-size:0.75rem;color:var(--text-dim);padding:0.4rem 0.5rem">${state.unmatched.length} unmatched</span>` : ''}
    </div>
  `;

  el.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeCat = btn.dataset.cat || null;
      renderCats();
      render();
    });
  });
}

function render() {
  const el = document.getElementById('mp-content');
  if (!el || !state.loaded) return;

  let filtered = state.masters;
  if (state.activeCat) filtered = filtered.filter(m => m.cat === state.activeCat);
  if (state.filter) {
    const q = state.filter.toLowerCase();
    filtered = filtered.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q) ||
      m.vendor.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty-state">No master products found</div>`;
    return;
  }

  el.innerHTML = `
    <div class="product-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
      ${filtered.map(mp => `
        <div class="product-card" data-id="${mp.id}" style="cursor:pointer">
          ${mp.images && mp.images[0]
            ? `<img src="${mp.images[0]}&width=300" class="product-img" style="height:180px" />`
            : `<div class="product-img-placeholder" style="height:180px">${mp.code}</div>`}
          <div class="product-info" style="padding:0.85rem">
            <div class="product-title">${mp.name}</div>
            <div class="product-meta">${mp.vendor || '—'} · ${mp.code}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem">
              <div class="product-price">${formatCurrency(mp.liveRetail || mp.retail)}</div>
              <div style="font-size:0.75rem;color:var(--text-dim)">${formatNumber(mp.totalInventory)} units</div>
            </div>
            ${mp.styleCount > 0 ? `
              <div style="margin-top:0.5rem;display:flex;gap:4px;flex-wrap:wrap">
                ${mp.styles.slice(0, 6).map(s => `
                  <span style="width:18px;height:18px;border-radius:50%;background:${s.color};border:1px solid var(--border);display:inline-block" title="${s.name} (${s.qty})"></span>
                `).join('')}
                ${mp.styles.length > 6 ? `<span style="font-size:0.7rem;color:var(--text-dim);padding:2px 4px">+${mp.styles.length - 6}</span>` : ''}
              </div>
            ` : ''}
            <div style="margin-top:0.4rem;font-size:0.72rem;color:var(--text-dim)">
              FOB ${formatCurrency(mp.fob)} · ${mp.margin ? mp.margin + '% margin' : '—'} · ${mp.shopifyProductCount} Shopify products
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

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
        await api.post('/api/products/sync');
        const data = await api.get('/api/products/masters');
        state.masters = data.masters || [];
        state.unmatched = data.unmatched || [];
        renderCats();
        render();
        emit('sync:complete', { source: 'marketplace', count: state.masters.length });
        emit('toast:show', { message: `Synced ${state.masters.length} master products`, type: 'success' });
      } catch (err) {
        emit('sync:error', { source: 'marketplace', error: err.message });
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync';
      }
    });
  }
}

on('sync:complete', async ({ source }) => {
  if (!_container || source === 'marketplace') return;
  try {
    const data = await api.get('/api/products/masters');
    state.masters = data.masters || [];
    renderCats();
    render();
  } catch (e) { /* ignore */ }
});

export function destroy() {
  _container = null;
  state = { loaded: false, masters: [], unmatched: [], categories: [], filter: '', activeCat: null };
}
