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

let _unsubs = [];
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
      ${filtered.map(mp => {
        const stockClass = mp.totalInventory === 0 ? 'sz-low' : mp.totalInventory < 20 ? 'sz-low' : '';
        const marginPill = mp.margin !== null
          ? `<span class="margin-pill ${mp.margin >= 55 ? 'high' : mp.margin >= 35 ? 'mid' : 'low'}">${mp.margin}%</span>`
          : '';
        return `
        <div class="product-card" data-id="${mp.id}" style="cursor:pointer">
          ${mp.images && mp.images[0]
            ? `<img src="${mp.images[0]}&width=300" class="product-img" style="height:180px" loading="lazy" />`
            : `<div class="product-img-placeholder" style="height:180px">${mp.code}</div>`}
          <div class="product-info" style="padding:0.85rem">
            <div class="product-title">${mp.name}</div>
            <div class="product-meta">${mp.vendor || '—'} · ${mp.code}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem">
              <div class="product-price">${formatCurrency(mp.liveRetail || mp.retail)}</div>
              <div style="font-size:0.75rem" class="${stockClass}">${formatNumber(mp.totalInventory)} units</div>
            </div>
            ${mp.styleCount > 0 ? `
              <div style="margin-top:0.5rem;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
                ${mp.styles.slice(0, 6).map(s => `
                  <span class="size-grid-color-dot" style="width:16px;height:16px;background:${s.color}" title="${s.name} (${s.qty})"></span>
                `).join('')}
                ${mp.styles.length > 6 ? `<span style="font-size:0.7rem;color:var(--text-dim)">+${mp.styles.length - 6}</span>` : ''}
              </div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.4rem">
              <span style="font-size:0.72rem;color:var(--text-dim)">FOB ${formatCurrency(mp.fob)}</span>
              ${marginPill}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;

  // Bind card clicks
  el.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const mp = filtered.find(m => m.id === card.dataset.id);
      if (mp) openMPDetail(mp);
    });
  });
}

// ── Size Grid Builder ──────────────────────────────────────

function buildSizeGrid(mp) {
  if (!mp.styles?.length) return '<div style="color:var(--text-dim);font-size:0.85rem;margin-bottom:1rem">No styles matched from Shopify</div>';

  return `
    <div class="size-grid-wrap">
      <h3 style="font-size:0.85rem;margin-bottom:0.5rem">Size Grid (${mp.styles.length} style${mp.styles.length !== 1 ? 's' : ''})</h3>
      ${mp.styles.map(style => {
        if (!style.fits?.length) {
          return `
            <div class="size-grid-style">
              <div class="size-grid-style-header">
                <span class="size-grid-color-dot" style="background:${style.color}"></span>
                ${style.name}
                <span style="font-weight:400;font-size:0.78rem;color:var(--text-dim);margin-left:auto">${formatNumber(style.qty)} units</span>
              </div>
            </div>`;
        }

        // Collect all unique sizes across fits, preserving order
        const allSizes = [];
        for (const fit of style.fits) {
          for (const sz of (fit.sizes || [])) {
            if (!allSizes.includes(sz)) allSizes.push(sz);
          }
        }

        return `
          <div class="size-grid-style">
            <div class="size-grid-style-header">
              <span class="size-grid-color-dot" style="background:${style.color}"></span>
              ${style.name}
              <span style="font-weight:400;font-size:0.78rem;color:var(--text-dim);margin-left:auto">${formatNumber(style.qty)} units</span>
            </div>
            <table class="size-grid-table">
              <thead>
                <tr>
                  <th>Fit</th>
                  ${allSizes.map(sz => `<th>${sz}</th>`).join('')}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${style.fits.map(fit => {
                  const fitSizes = fit.sizes || [];
                  return `
                    <tr>
                      <td>${fit.name}</td>
                      ${allSizes.map(sz => {
                        const available = fitSizes.includes(sz);
                        return `<td class="${available ? 'sz-ok' : 'sz-zero'}">${available ? '\u2713' : '\u2014'}</td>`;
                      }).join('')}
                      <td class="sz-total">${formatNumber(fit.qty)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
      }).join('')}
    </div>
  `;
}

// ── MP Detail Modal ────────────────────────────────────────

function openMPDetail(mp) {
  emit('modal:open', {
    title: mp.name,
    wide: true,
    html: `
      <div class="mp-detail-top">
        ${mp.images?.[0]
          ? `<img src="${mp.images[0]}&width=260" class="mp-detail-img" />`
          : `<div class="mp-detail-placeholder">${mp.code}</div>`}
        <div class="mp-detail-info">
          <div class="mp-detail-meta">${mp.cat} · ${mp.code}</div>
          <div class="mp-detail-vendor">${mp.vendor || 'No vendor'}</div>
          <div class="mp-detail-metrics">
            <div><span class="mp-detail-metric-label">Retail:</span> ${formatCurrency(mp.liveRetail || mp.retail)}</div>
            <div><span class="mp-detail-metric-label">FOB:</span> ${formatCurrency(mp.fob)}</div>
            <div><span class="mp-detail-metric-label">Margin:</span> ${mp.margin ? `<span class="margin-pill ${mp.margin >= 55 ? 'high' : mp.margin >= 35 ? 'mid' : 'low'}">${mp.margin}%</span>` : '\u2014'}</div>
            <div><span class="mp-detail-metric-label">Landed:</span> ${formatCurrency(mp.landedCost)}</div>
            <div><span class="mp-detail-metric-label">Stock:</span> <strong class="${mp.totalInventory === 0 ? 'sz-low' : ''}">${formatNumber(mp.totalInventory)}</strong></div>
            <div><span class="mp-detail-metric-label">Variants:</span> ${mp.variantCount}</div>
          </div>
        </div>
      </div>

      <div class="mp-sourcing-bar">
        <div class="mp-sourcing-item"><span>MOQ:</span> ${mp.moq || '\u2014'}</div>
        <div class="mp-sourcing-item"><span>Lead:</span> ${mp.lead ? mp.lead + 'd' : '\u2014'}</div>
        <div class="mp-sourcing-item"><span>HTS:</span> ${mp.hts || '\u2014'}</div>
        <div class="mp-sourcing-item"><span>Duty:</span> ${mp.duty ? mp.duty + '%' : '\u2014'}</div>
      </div>

      ${buildSizeGrid(mp)}

      <div style="font-size:0.78rem;color:var(--text-dim);padding-top:0.75rem;border-top:1px solid var(--border-light)">
        ${mp.shopifyProductCount} Shopify product${mp.shopifyProductCount !== 1 ? 's' : ''} matched ·
        Sizes: ${mp.sizes || '\u2014'}
        ${mp.fits?.length ? ` · Fits: ${mp.fits.join(', ')}` : ''}
      </div>

      <!-- Quick PO -->
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
        createBtn.textContent = `Quick PO (${formatNumber(units)} units)`;
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
          createBtn.textContent = `Quick PO (${formatNumber(parseInt(unitsInput?.value) || mp.moq || 50)} units)`;
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
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  _container = null;
  state = { loaded: false, masters: [], unmatched: [], categories: [], filter: '', activeCat: null };
}
