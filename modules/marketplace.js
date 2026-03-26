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

  // Bind card clicks for detail view
  el.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const mp = filtered.find(m => m.id === card.dataset.id);
      if (mp) openMPDetail(mp);
    });
  });
}

function openMPDetail(mp) {
  emit('modal:open', {
    title: mp.name,
    wide: true,
    html: `
      <div style="display:flex;gap:1rem;margin-bottom:1rem;align-items:flex-start">
        ${mp.images?.[0]
          ? `<img src="${mp.images[0]}&width=200" style="width:120px;height:120px;object-fit:cover;border-radius:var(--radius-lg);flex-shrink:0" />`
          : `<div style="width:120px;height:120px;background:var(--surface-2);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:var(--text-dim);flex-shrink:0">${mp.code}</div>`}
        <div style="flex:1;min-width:0">
          <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.25rem">${mp.cat} · ${mp.code}</div>
          <div style="font-size:0.85rem;margin-bottom:0.5rem">${mp.vendor || 'No vendor'}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;font-size:0.82rem">
            <div><span style="color:var(--text-dim)">Retail:</span> ${formatCurrency(mp.liveRetail || mp.retail)}</div>
            <div><span style="color:var(--text-dim)">FOB:</span> ${formatCurrency(mp.fob)}</div>
            <div><span style="color:var(--text-dim)">Margin:</span> ${mp.margin ? mp.margin + '%' : '—'}</div>
            <div><span style="color:var(--text-dim)">Landed:</span> ${formatCurrency(mp.landedCost)}</div>
            <div><span style="color:var(--text-dim)">Stock:</span> ${formatNumber(mp.totalInventory)}</div>
            <div><span style="color:var(--text-dim)">Variants:</span> ${mp.variantCount}</div>
          </div>
        </div>
      </div>

      <!-- Sourcing -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.5rem;font-size:0.78rem;margin-bottom:1rem;
        background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--radius);padding:0.6rem 0.75rem">
        <div><span style="color:var(--text-dim)">MOQ:</span> ${mp.moq || '—'}</div>
        <div><span style="color:var(--text-dim)">Lead:</span> ${mp.lead ? mp.lead + 'd' : '—'}</div>
        <div><span style="color:var(--text-dim)">HTS:</span> ${mp.hts || '—'}</div>
        <div><span style="color:var(--text-dim)">Duty:</span> ${mp.duty ? mp.duty + '%' : '—'}</div>
      </div>

      ${mp.styles?.length ? `
        <h3 style="font-size:0.85rem;margin-bottom:0.5rem">Styles (${mp.styles.length})</h3>
        <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem">
          ${mp.styles.map(s => `
            <div style="background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--radius);padding:0.6rem 0.75rem;display:flex;align-items:center;gap:0.75rem">
              <span style="width:20px;height:20px;border-radius:50%;background:${s.color};border:1px solid var(--border);flex-shrink:0"></span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:0.85rem">${s.name}</div>
                <div style="font-size:0.75rem;color:var(--text-dim)">
                  ${formatNumber(s.qty)} units
                  ${s.fits?.length ? ` · ${s.fits.map(f => `${f.name} (${f.qty})`).join(', ')}` : ''}
                </div>
                ${s.fits?.length ? `
                  <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem">
                    Sizes: ${s.fits.flatMap(f => f.sizes || []).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : '<div style="color:var(--text-dim);font-size:0.85rem;margin-bottom:1rem">No styles matched from Shopify</div>'}

      <div style="font-size:0.78rem;color:var(--text-dim);padding-top:0.75rem;border-top:1px solid var(--border-light)">
        ${mp.shopifyProductCount} Shopify product${mp.shopifyProductCount !== 1 ? 's' : ''} matched ·
        Sizes: ${mp.sizes || '—'}
        ${mp.fits?.length ? ` · Fits: ${mp.fits.join(', ')}` : ''}
      </div>

      <!-- Quick PO creation -->
      <div style="border-top:1px solid var(--border-light);margin-top:0.75rem;padding-top:0.75rem">
        <div style="font-size:0.82rem;font-weight:600;margin-bottom:0.5rem">Quick PO</div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0.5rem">
            <label class="form-label">Units</label>
            <input id="mpd-units" type="number" class="form-input" placeholder="${mp.moq || 50}" min="1" value="${mp.moq || 50}" />
          </div>
          <div class="form-group" style="margin-bottom:0.5rem">
            <label class="form-label">FOB Total</label>
            <div id="mpd-total" style="font-family:var(--font-mono);font-size:0.9rem;font-weight:600;padding:0.5rem 0">${formatCurrency((mp.moq || 50) * (mp.fob || 0))}</div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button id="mpd-create-po" class="btn btn-primary" style="flex:1">Quick PO (${mp.moq || 50} units)</button>
          <button id="mpd-full-form" class="btn btn-secondary" style="flex:1">Full PO Form</button>
        </div>
      </div>
    `,
    onMount: (body) => {
      const unitsInput = body.querySelector('#mpd-units');
      const totalDiv = body.querySelector('#mpd-total');
      const createBtn = body.querySelector('#mpd-create-po');

      unitsInput?.addEventListener('input', () => {
        const units = parseInt(unitsInput.value) || 0;
        totalDiv.textContent = formatCurrency(units * (mp.fob || 0));
      });

      createBtn?.addEventListener('click', async () => {
        const units = parseInt(unitsInput?.value) || mp.moq || 50;
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        try {
          const result = await api.post('/api/purchase-orders', { mpId: mp.id, units });
          emit('modal:close');
          emit('toast:show', { message: `PO ${result.purchaseOrder.id} created for ${mp.name}`, type: 'success' });
          emit('po:created', result.purchaseOrder);
        } catch (err) {
          emit('toast:show', { message: err.message, type: 'error' });
          createBtn.disabled = false;
          createBtn.textContent = `Create PO for ${mp.code}`;
        }
      });

      body.querySelector('#mpd-full-form')?.addEventListener('click', () => {
        emit('modal:close');
        emit('po:create-from-mp', { mpId: mp.id });
        emit('nav:change', { route: 'cash-flow' });
      });
    },
  });
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
