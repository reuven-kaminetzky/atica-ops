/**
 * Shipments Module — Track shipments from PO "In Transit" to arrival
 *
 * API endpoints:
 *   GET  /api/shipments             → list all
 *   GET  /api/shipments/:id         → single shipment
 *   PATCH /api/shipments/:id        → update container, vessel, ETA, status
 *   POST /api/shipments/:id/arrive  → mark arrived
 *
 * Subscribes: sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, formatDate, skeleton } from './core.js';

let state = { loaded: false, shipments: [], filter: 'all' };
let _container = null;
let _unsub = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Shipments</h2>
      <div class="module-tabs">
        <button class="tab active" data-filter="all">All</button>
        <button class="tab" data-filter="in-transit">In Transit</button>
        <button class="tab" data-filter="arrived">Arrived</button>
      </div>
    </div>
    <div id="ship-content">${skeleton(6)}</div>
  `;

  bindTabs();
  _unsub = on('sync:complete', () => _container && loadData());
  await loadData();
}

export function destroy() {
  if (_unsub) _unsub();
  _unsub = null;
  _container = null;
  state = { loaded: false, shipments: [], filter: 'all' };
}

async function loadData() {
  const el = document.getElementById('ship-content');
  if (!el) return;
  el.innerHTML = skeleton(6);

  try {
    const data = await api.get('/api/shipments');
    state.shipments = data.shipments || [];
    state.loaded = true;
    render();
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load shipments: ${err.message}</div>`;
  }
}

function render() {
  const el = document.getElementById('ship-content');
  if (!el || !state.loaded) return;

  let ships = state.shipments;
  if (state.filter !== 'all') ships = ships.filter(s => s.status === state.filter);

  const inTransit = state.shipments.filter(s => s.status === 'in-transit');
  const arrived = state.shipments.filter(s => s.status === 'arrived');
  const totalValue = inTransit.reduce((s, sh) => s + (sh.fobTotal || 0), 0);
  const totalUnits = inTransit.reduce((s, sh) => s + (sh.units || 0), 0);

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">In Transit</div>
        <div class="stat-value">${inTransit.length}</div>
        <div class="stat-card-sub">${formatNumber(totalUnits)} units</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Transit Value</div>
        <div class="stat-value">${formatCurrency(totalValue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Arrived</div>
        <div class="stat-value">${arrived.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total</div>
        <div class="stat-value">${state.shipments.length}</div>
      </div>
    </div>

    ${ships.length === 0 ? '<div class="empty-state">No shipments found</div>' : `
      <table class="data-table">
        <thead><tr>
          <th>ID</th><th>PO</th><th>Product</th><th>Vendor</th>
          <th style="text-align:right">Units</th>
          <th style="text-align:right">Value</th>
          <th>Status</th><th>ETA</th><th></th>
        </tr></thead>
        <tbody>
          ${ships.map(sh => {
            const isTransit = sh.status === 'in-transit';
            const etaDate = sh.eta ? new Date(sh.eta) : null;
            const daysUntil = etaDate ? Math.ceil((etaDate - Date.now()) / 86400000) : null;
            const etaLabel = daysUntil !== null
              ? daysUntil <= 0 ? 'Due' : daysUntil + 'd'
              : '';
            return `
            <tr class="ship-row" data-id="${sh.id}" style="cursor:pointer">
              <td style="font-family:var(--font-mono);font-size:0.78rem">${sh.id}</td>
              <td style="font-family:var(--font-mono);font-size:0.78rem">${sh.poId || sh.poNum || '—'}</td>
              <td style="font-weight:600">${sh.mpName || '—'}</td>
              <td style="font-size:0.82rem;color:var(--text-dim)">${sh.vendor || '—'}</td>
              <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(sh.units || 0)}</td>
              <td style="text-align:right;font-family:var(--font-mono)">${formatCurrency(sh.fobTotal || 0)}</td>
              <td><span class="po-stage-badge ${isTransit ? 'mid' : 'late'}">${sh.status}</span></td>
              <td style="font-size:0.78rem;color:var(--text-dim)">${sh.eta ? formatDate(sh.eta) : '—'} ${etaLabel ? `<span style="font-size:0.68rem;font-weight:600;color:${daysUntil <= 0 ? 'var(--danger)' : daysUntil <= 7 ? 'var(--warning)' : 'var(--text-dim)'}">${etaLabel}</span>` : ''}</td>
              <td>${isTransit ? `<button class="btn btn-sm btn-primary arrive-btn" data-id="${sh.id}">Arrive</button>` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `}
  `;

  // Bind row clicks for detail
  el.querySelectorAll('.ship-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.arrive-btn')) return;
      const sh = ships.find(s => s.id === row.dataset.id);
      if (sh) openShipmentDetail(sh);
    });
  });

  // Bind arrive buttons
  el.querySelectorAll('.arrive-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        await api.post(`/api/shipments/${id}/arrive`, { note: 'Marked arrived from Shipments module' });
        emit('toast:show', { message: `Shipment ${id} arrived`, type: 'success' });
        emit('po:received', { shipmentId: id });
        await loadData();
      } catch (err) {
        emit('toast:show', { message: err.message, type: 'error' });
        btn.disabled = false;
        btn.textContent = 'Arrive';
      }
    });
  });
}

function openShipmentDetail(sh) {
  const events = sh.events || [];

  emit('modal:open', {
    title: `Shipment ${sh.id}`,
    wide: true,
    html: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;font-size:0.85rem;background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--radius);padding:0.75rem;margin-bottom:1rem">
        <div><span style="color:var(--text-dim)">PO:</span> ${sh.poId || sh.poNum || '—'}</div>
        <div><span style="color:var(--text-dim)">Product:</span> ${sh.mpName || '—'}</div>
        <div><span style="color:var(--text-dim)">Vendor:</span> ${sh.vendor || '—'}</div>
        <div><span style="color:var(--text-dim)">Status:</span> <span class="po-stage-badge ${sh.status === 'in-transit' ? 'mid' : 'late'}">${sh.status}</span></div>
        <div><span style="color:var(--text-dim)">Units:</span> ${formatNumber(sh.units || 0)}</div>
        <div><span style="color:var(--text-dim)">Value:</span> ${formatCurrency(sh.fobTotal || 0)}</div>
        <div><span style="color:var(--text-dim)">Container:</span> ${sh.container || '—'}</div>
        <div><span style="color:var(--text-dim)">Vessel:</span> ${sh.vessel || '—'}</div>
        <div><span style="color:var(--text-dim)">ETD:</span> ${sh.etd ? formatDate(sh.etd) : '—'}</div>
        <div><span style="color:var(--text-dim)">ETA:</span> ${sh.eta ? formatDate(sh.eta) : '—'}</div>
        ${sh.arrivedAt ? `<div><span style="color:var(--text-dim)">Arrived:</span> ${formatDate(sh.arrivedAt)}</div>` : ''}
      </div>

      ${events.length ? `
        <h3 style="font-size:0.85rem;margin-bottom:0.5rem">Events</h3>
        <div style="font-size:0.82rem;max-height:160px;overflow-y:auto">
          ${events.map(ev => `
            <div style="padding:0.35rem 0;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between">
              <span><span class="po-stage-badge ${ev.type === 'arrived' ? 'late' : ev.type === 'created' ? 'early' : 'mid'}">${ev.type}</span> ${ev.note || ''}</span>
              <span style="color:var(--text-dim);font-size:0.75rem">${ev.date ? formatDate(ev.date) : '—'}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${sh.status === 'in-transit' ? `
        <div style="border-top:1px solid var(--border-light);margin-top:1rem;padding-top:1rem">
          <h3 style="font-size:0.85rem;margin-bottom:0.5rem">Update Shipment</h3>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Container</label><input id="sh-container" class="form-input" value="${sh.container || ''}" /></div>
            <div class="form-group"><label class="form-label">Vessel</label><input id="sh-vessel" class="form-input" value="${sh.vessel || ''}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">ETA</label><input id="sh-eta" type="date" class="form-input" value="${sh.eta ? sh.eta.slice(0, 10) : ''}" /></div>
            <div class="form-group" style="display:flex;align-items:flex-end"><button id="sh-save" class="btn btn-primary" style="width:100%">Save</button></div>
          </div>
        </div>
      ` : ''}
    `,
    onMount: (body) => {
      if (sh.status !== 'in-transit') return;
      body.querySelector('#sh-save')?.addEventListener('click', async () => {
        const btn = body.querySelector('#sh-save');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          await api.patch(`/api/shipments/${sh.id}`, {
            container: body.querySelector('#sh-container')?.value || null,
            vessel: body.querySelector('#sh-vessel')?.value || null,
            eta: body.querySelector('#sh-eta')?.value || null,
          });
          emit('modal:close');
          emit('toast:show', { message: 'Shipment updated', type: 'success' });
          await loadData();
        } catch (err) {
          emit('toast:show', { message: err.message, type: 'error' });
          btn.disabled = false;
          btn.textContent = 'Save';
        }
      });
    },
  });
}

function bindTabs() {
  _container?.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      render();
    });
  });
}
