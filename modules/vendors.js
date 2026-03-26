/**
 * Vendors Module — Vendor management, PO rollup, product lines
 * 
 * Not a separate API — aggregates from /api/products/seeds + /api/purchase-orders
 * Shows: POs grouped by vendor, total committed cost, lead time, product lines
 * 
 * Subscribes: sync:complete, po:created, po:updated
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, formatDate, skeleton } from './core.js';

let state = { loaded: false, vendors: [], view: 'overview' };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Vendors</h2>
    </div>
    <div id="vendor-content">${skeleton(6)}</div>
  `;

  try {
    const [seeds, pos] = await Promise.all([
      api.get('/api/products/seeds'),
      api.get('/api/purchase-orders'),
    ]);

    const seedList = seeds.seeds || [];
    const poList = pos.purchaseOrders || [];
    state.vendors = buildVendorView(seedList, poList);
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('vendor-content').innerHTML =
      `<div class="empty-state">Failed to load vendor data: ${err.message}</div>`;
  }
}

function buildVendorView(seeds, pos) {
  const vendors = {};

  // Group MPs by vendor
  for (const seed of seeds) {
    const v = seed.vendor || 'Unknown';
    if (!vendors[v]) {
      vendors[v] = {
        name: v,
        products: [],
        categories: new Set(),
        totalMPs: 0,
        avgFob: 0,
        avgLead: 0,
        pos: [],
        activePOCost: 0,
        activePOUnits: 0,
        totalPOCost: 0,
      };
    }
    vendors[v].products.push({ id: seed.id, name: seed.name, code: seed.code, cat: seed.cat, fob: seed.fob });
    vendors[v].categories.add(seed.cat);
    vendors[v].totalMPs++;
  }

  // Compute averages
  for (const v of Object.values(vendors)) {
    const fobs = v.products.map(p => p.fob).filter(f => f > 0);
    const leads = seeds.filter(s => (s.vendor || 'Unknown') === v.name && s.lead > 0).map(s => s.lead);
    v.avgFob = fobs.length ? +(fobs.reduce((a, b) => a + b, 0) / fobs.length).toFixed(2) : 0;
    v.avgLead = leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : 0;
    v.categories = [...v.categories];
  }

  // Attach POs
  for (const po of pos) {
    const v = po.vendor || 'Unknown';
    if (!vendors[v]) continue;
    vendors[v].pos.push(po);
    vendors[v].totalPOCost += (po.fobTotal || 0);
    if (!['Received', 'Distribution'].includes(po.stage)) {
      vendors[v].activePOCost += (po.fobTotal || 0);
      vendors[v].activePOUnits += (po.units || 0);
    }
  }

  return Object.values(vendors).sort((a, b) => b.totalMPs - a.totalMPs);
}

function render() {
  const el = document.getElementById('vendor-content');
  if (!el || !state.loaded) return;

  const totalActiveCost = state.vendors.reduce((s, v) => s + v.activePOCost, 0);
  const totalMPs = state.vendors.reduce((s, v) => s + v.totalMPs, 0);

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Vendors</div>
        <div class="stat-value">${state.vendors.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Product Lines</div>
        <div class="stat-value">${totalMPs}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active PO Cost</div>
        <div class="stat-value">${formatCurrency(totalActiveCost)}</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:1rem">
      ${state.vendors.map(v => `
        <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);overflow:hidden">
          <div style="padding:1rem;display:flex;justify-content:space-between;align-items:flex-start;cursor:pointer" 
               onclick="this.parentElement.querySelector('.vendor-detail').classList.toggle('open')">
            <div>
              <div style="font-weight:600;font-size:1rem">${v.name}</div>
              <div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.2rem">
                ${v.totalMPs} MPs · ${v.categories.join(', ')}
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-family:var(--font-mono);font-weight:600">${formatCurrency(v.activePOCost)}</div>
              <div style="font-size:0.72rem;color:var(--text-dim)">
                ${v.pos.filter(p => !['Received','Distribution'].includes(p.stage)).length} active POs · 
                avg lead ${v.avgLead}d
              </div>
            </div>
          </div>
          <div class="vendor-detail" style="display:none;border-top:1px solid var(--border-light);padding:0.75rem">
            <div style="font-size:0.78rem;font-weight:600;color:var(--text-dim);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em">Products</div>
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.75rem">
              ${v.products.map(p => `
                <span style="font-size:0.75rem;padding:0.2rem 0.5rem;background:var(--surface-2);border:1px solid var(--border-light);border-radius:4px">
                  ${p.code} — ${formatCurrency(p.fob)}
                </span>
              `).join('')}
            </div>
            ${v.pos.length ? `
              <div style="font-size:0.78rem;font-weight:600;color:var(--text-dim);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em">Purchase Orders</div>
              <table class="data-table" style="font-size:0.8rem">
                <thead><tr><th>PO</th><th>Product</th><th>Stage</th><th style="text-align:right">Units</th><th style="text-align:right">Cost</th></tr></thead>
                <tbody>
                  ${v.pos.map(po => `
                    <tr>
                      <td style="font-family:var(--font-mono)">${po.id}</td>
                      <td>${po.mpName || po.mpCode || '—'}</td>
                      <td><span class="badge">${po.stage || 'Concept'}</span></td>
                      <td style="text-align:right">${formatNumber(po.units || 0)}</td>
                      <td style="text-align:right">${formatCurrency(po.fobTotal || 0)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<div style="font-size:0.82rem;color:var(--text-dim)">No purchase orders</div>'}
          </div>
        </div>
      `).join('')}
    </div>

    <style>
      .vendor-detail.open { display: block !important; }
    </style>
  `;
}

on('sync:complete', async () => {
  if (!_container) return;
  try {
    const [seeds, pos] = await Promise.all([
      api.get('/api/products/seeds'),
      api.get('/api/purchase-orders'),
    ]);
    state.vendors = buildVendorView(seeds.seeds || [], pos.purchaseOrders || []);
    render();
  } catch (e) { /* ignore */ }
});

on('po:created', () => { if (_container) init(_container); });
on('po:updated', () => { if (_container) init(_container); });

export function destroy() {
  _container = null;
  state = { loaded: false, vendors: [], view: 'overview' };
}
