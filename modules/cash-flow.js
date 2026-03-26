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
 * Subscribes: sync:complete, po:create-from-mp
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, formatDate, skeleton } from './core.js';

let state = {
  loaded: false,
  salesData: null,
  reorderPlan: null,
  purchaseOrders: [],
  stages: [],
  seeds: [],
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
    const [sales, pos, stages, reorder, seeds] = await Promise.allSettled([
      api.get('/api/orders/sales', { days: 30 }),
      api.get('/api/purchase-orders'),
      api.get('/api/purchase-orders/stages'),
      api.get('/api/products/reorder', { days: 30, cover: 90 }),
      api.get('/api/products/seeds'),
    ]);
    state.salesData = sales.status === 'fulfilled' ? sales.value : null;
    state.purchaseOrders = pos.status === 'fulfilled' ? (pos.value.purchaseOrders || []) : [];
    state.stages = stages.status === 'fulfilled' ? (stages.value.stages || []) : [];
    state.reorderPlan = reorder.status === 'fulfilled' ? reorder.value : null;
    state.seeds = seeds.status === 'fulfilled' ? (seeds.value.seeds || []) : [];
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
  const allPOs = state.purchaseOrders;
  const activePOs = allPOs.filter(po => !['Received', 'Distribution'].includes(po.stage));
  const completedPOs = allPOs.filter(po => ['Received', 'Distribution'].includes(po.stage));

  // Cost aggregation
  const totalPOCost = activePOs.reduce((sum, po) => sum + (po.fobTotal || 0), 0);
  const totalPOUnits = activePOs.reduce((sum, po) => sum + (po.units || 0), 0);
  const completedPOCost = completedPOs.reduce((sum, po) => sum + (po.fobTotal || 0), 0);
  const totalCommittedCost = allPOs.reduce((sum, po) => sum + (po.fobTotal || 0), 0);
  const revenue = s?.totalRevenue || 0;
  const netPosition = revenue - totalCommittedCost;
  const grossMargin = revenue > 0 ? +((1 - totalCommittedCost / revenue) * 100).toFixed(1) : 0;
  const dailyBurn = activePOs.length > 0
    ? +(totalPOCost / Math.max(activePOs.length, 1) / 30).toFixed(2)
    : 0;

  // PO stage breakdown
  const stageCounts = {};
  const stageCosts = {};
  for (const po of activePOs) {
    const st = po.stage || 'Concept';
    stageCounts[st] = (stageCounts[st] || 0) + 1;
    stageCosts[st] = (stageCosts[st] || 0) + (po.fobTotal || 0);
  }

  // Stage badge color
  const earlyStages = ['Concept', 'Design', 'Sample', 'Approved', 'Costed'];
  const midStages = ['Ordered', 'Production', 'QC'];

  function stageBadgeClass(stage) {
    if (earlyStages.includes(stage)) return 'early';
    if (midStages.includes(stage)) return 'mid';
    return 'late';
  }

  // Revenue/cost proportion for visual bar
  const totalBar = revenue + totalCommittedCost || 1;
  const revPct = (revenue / totalBar * 100).toFixed(1);
  const costPct = (totalCommittedCost / totalBar * 100).toFixed(1);

  el.innerHTML = `
    <!-- KPI Cards -->
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Revenue (30d)</div>
        <div class="stat-value">${formatCurrency(revenue)}</div>
        <div class="stat-card-sub">${formatNumber(s?.totalOrders || 0)} orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total PO Committed</div>
        <div class="stat-value">${formatCurrency(totalCommittedCost)}</div>
        <div class="stat-card-sub">${allPOs.length} POs total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Position</div>
        <div class="stat-value" style="color:${netPosition >= 0 ? 'var(--success)' : 'var(--danger)'}">${netPosition >= 0 ? '+' : ''}${formatCurrency(netPosition)}</div>
        <div class="stat-card-sub">${grossMargin}% gross margin</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Order Value</div>
        <div class="stat-value">${formatCurrency(s?.avgOrderValue || 0)}</div>
        <div class="stat-card-sub">${formatCurrency(revenue / Math.max(30, 1))}/day</div>
      </div>
    </div>

    <!-- Cost Breakdown Panels -->
    <div class="cf-overview-grid">
      <div class="cf-panel">
        <h3>Revenue vs Cost</h3>
        <div class="cf-kpi-row">
          <span class="cf-kpi-label">Revenue (30d)</span>
          <span class="cf-kpi-value positive">${formatCurrency(revenue)}</span>
        </div>
        <div class="cf-kpi-row">
          <span class="cf-kpi-label">Active PO Cost</span>
          <span class="cf-kpi-value negative">${formatCurrency(totalPOCost)}</span>
        </div>
        <div class="cf-kpi-row">
          <span class="cf-kpi-label">Completed PO Cost</span>
          <span class="cf-kpi-value">${formatCurrency(completedPOCost)}</span>
        </div>
        <div class="cf-kpi-row" style="font-weight:700">
          <span class="cf-kpi-label">Net Position</span>
          <span class="cf-kpi-value ${netPosition >= 0 ? 'positive' : 'negative'}">${netPosition >= 0 ? '+' : ''}${formatCurrency(netPosition)}</span>
        </div>
        <div class="cf-net-bar">
          <div class="cf-net-bar-revenue" style="width:${revPct}%"></div>
          <div class="cf-net-bar-cost" style="width:${costPct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-dim)">
          <span>Revenue ${revPct}%</span>
          <span>Cost ${costPct}%</span>
        </div>
      </div>

      <div class="cf-panel">
        <h3>Active POs by Stage</h3>
        ${activePOs.length === 0 ? '<div class="empty-state" style="padding:1rem">No active POs</div>' : `
          ${Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).map(([stage, count]) => `
            <div class="cf-kpi-row">
              <span><span class="po-stage-badge ${stageBadgeClass(stage)}">${stage}</span></span>
              <span class="cf-kpi-value">${count} POs · ${formatCurrency(stageCosts[stage] || 0)}</span>
            </div>
          `).join('')}
          <div class="cf-kpi-row" style="font-weight:700;margin-top:0.25rem">
            <span class="cf-kpi-label">Total Active</span>
            <span class="cf-kpi-value">${activePOs.length} POs · ${formatCurrency(totalPOCost)}</span>
          </div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.5rem">${formatNumber(totalPOUnits)} units on order</div>
        `}
      </div>
    </div>

    <!-- Daily Revenue Chart -->
    ${s?.dailySales?.length ? `
      <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:1rem;margin-bottom:1.5rem">
        <h3 style="margin-bottom:0.5rem">Daily Revenue — Last 30 Days</h3>
        <div class="daily-chart">
          ${s.dailySales.map(d => {
            const maxRev = Math.max(...s.dailySales.map(x => x.revenue || 0), 1);
            return `
              <div class="daily-bar" title="${d.date}: ${formatCurrency(d.revenue || 0)}">
                <div class="bar-fill" style="height:${Math.max(2, ((d.revenue || 0) / maxRev) * 100)}%"></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Active PO List -->
    ${activePOs.length ? `
      <h3>Active Purchase Orders</h3>
      <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);overflow:hidden">
        ${activePOs.slice(0, 10).map(po => `
          <div class="po-card po-row" data-id="${po.id}" style="cursor:pointer">
            <div class="po-vendor">${po.vendor || '—'}</div>
            <div class="po-product">${po.mpName || po.mpCode || '—'}</div>
            <div class="po-cost">${formatCurrency(po.fobTotal || 0)}</div>
            <div><span class="po-stage-badge ${stageBadgeClass(po.stage || 'Concept')}">${po.stage || 'Concept'}</span></div>
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
      <button id="cf-new-po" class="btn btn-primary">+ New PO</button>
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
                const hasGate = state.stages[stageIdx]?.gate;
                return `
                  <tr class="po-row" data-id="${po.id}" style="cursor:pointer">
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

  // Bind row clicks
  el.querySelectorAll('.po-row').forEach(row => {
    row.addEventListener('click', () => {
      const po = pos.find(p => p.id === row.dataset.id);
      if (po) openPODetail(po);
    });
  });
}

// ── PO Detail Modal ─────────────────────────────────────────

function openPODetail(po) {
  const stages = state.stages;
  const currentIdx = stages.findIndex(s => s.name === po.stage);
  const nextStage = stages[currentIdx + 1] || null;
  const checkIns = po.checkIns || { pd: [], fin: [] };
  const history = po.history || [];

  emit('modal:open', {
    title: `PO ${po.id}`,
    wide: true,
    html: `
      <div style="margin-bottom:1rem">
        <div style="font-size:1.1rem;font-weight:600;margin-bottom:0.25rem">${po.mpName || po.vendor || '—'}</div>
        <div style="font-size:0.82rem;color:var(--text-dim)">${po.vendor || '—'} · ${po.cat || '—'} · ${po.mpCode || ''}</div>
      </div>

      <!-- Stage Track -->
      <div style="display:flex;align-items:center;gap:0;margin-bottom:1.25rem;overflow-x:auto;padding:0.5rem 0">
        ${stages.map((s, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          const gateLabel = s.gate === 'pd' ? 'PD' : s.gate === 'fin' ? 'FIN' : '';
          return `
            ${i > 0 ? `<div style="flex:1;height:2px;min-width:8px;background:${done ? 'var(--success)' : 'var(--border)'}"></div>` : ''}
            <div style="display:flex;flex-direction:column;align-items:center;min-width:28px" title="${s.name}${s.desc ? ': ' + s.desc : ''}">
              <div style="width:${active ? '26px' : '20px'};height:${active ? '26px' : '20px'};border-radius:50%;
                background:${done ? 'var(--success)' : 'var(--surface-2)'};
                border:2px solid ${done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border)'};
                color:${done ? 'white' : 'var(--text-dim)'};font-size:${active ? '10px' : '8px'};font-weight:700;
                display:flex;align-items:center;justify-content:center;flex-shrink:0;
                ${active ? 'box-shadow:0 0 0 3px var(--primary-light)' : ''}">${i + 1}</div>
              <div style="font-size:0.6rem;color:${active ? 'var(--text)' : 'var(--text-muted)'};
                margin-top:3px;text-align:center;font-weight:${active ? '600' : '400'};
                max-width:52px;line-height:1.2">${s.name}</div>
              ${gateLabel ? `<div style="font-size:0.55rem;color:var(--primary);font-weight:700;margin-top:1px">${gateLabel}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <!-- Editable Details -->
      <div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
          <h3 style="font-size:0.85rem;margin:0">Details</h3>
          <button id="po-edit-toggle" class="btn btn-sm">Edit</button>
        </div>
        <div id="po-detail-view" style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;font-size:0.82rem;
          background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--radius);padding:0.75rem">
          <div><span style="color:var(--text-dim)">Vendor:</span> ${po.vendor || '—'}</div>
          <div><span style="color:var(--text-dim)">Units:</span> ${formatNumber(po.units || 0)}</div>
          <div><span style="color:var(--text-dim)">FOB:</span> ${formatCurrency(po.fob || 0)}</div>
          <div><span style="color:var(--text-dim)">FOB Total:</span> <strong>${formatCurrency(po.fobTotal || 0)}</strong></div>
          <div><span style="color:var(--text-dim)">Landed Cost:</span> ${po.landedCost ? formatCurrency(po.landedCost) : '—'}</div>
          <div><span style="color:var(--text-dim)">MOQ:</span> ${po.moq || '—'}</div>
          <div><span style="color:var(--text-dim)">Lead:</span> ${po.lead ? po.lead + 'd' : '—'}</div>
          <div><span style="color:var(--text-dim)">ETD:</span> ${po.etd ? formatDate(po.etd) : '—'}</div>
          <div><span style="color:var(--text-dim)">ETA:</span> ${po.eta ? formatDate(po.eta) : '—'}</div>
          ${po.container ? `<div><span style="color:var(--text-dim)">Container:</span> ${po.container}</div>` : ''}
          ${po.vessel ? `<div><span style="color:var(--text-dim)">Vessel:</span> ${po.vessel}</div>` : ''}
        </div>
        <div id="po-edit-form" style="display:none">
          <div class="form-row" style="margin-bottom:0.5rem">
            <div class="form-group" style="margin-bottom:0"><label class="form-label">Vendor</label><input id="pod-vendor" class="form-input" value="${po.vendor || ''}" /></div>
            <div class="form-group" style="margin-bottom:0"><label class="form-label">Units</label><input id="pod-units" type="number" class="form-input" value="${po.units || 0}" min="0" /></div>
          </div>
          <div class="form-row" style="margin-bottom:0.5rem">
            <div class="form-group" style="margin-bottom:0"><label class="form-label">FOB ($)</label><input id="pod-fob" type="number" step="0.01" class="form-input" value="${po.fob || 0}" /></div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">FOB Total</label>
              <div id="pod-total" style="font-family:var(--font-mono);font-weight:600;padding:0.5rem 0">${formatCurrency(po.fobTotal || 0)}</div>
            </div>
          </div>
          <div class="form-row" style="margin-bottom:0.5rem">
            <div class="form-group" style="margin-bottom:0"><label class="form-label">ETD</label><input id="pod-etd" type="date" class="form-input" value="${po.etd ? po.etd.slice(0, 10) : ''}" /></div>
            <div class="form-group" style="margin-bottom:0"><label class="form-label">ETA</label><input id="pod-eta" type="date" class="form-input" value="${po.eta ? po.eta.slice(0, 10) : ''}" /></div>
          </div>
          <div class="form-row" style="margin-bottom:0.5rem">
            <div class="form-group" style="margin-bottom:0"><label class="form-label">Container</label><input id="pod-container" class="form-input" value="${po.container || ''}" placeholder="Container #" /></div>
            <div class="form-group" style="margin-bottom:0"><label class="form-label">Vessel</label><input id="pod-vessel" class="form-input" value="${po.vessel || ''}" placeholder="Vessel name" /></div>
          </div>
          <div class="form-group" style="margin-bottom:0.5rem">
            <label class="form-label">Notes</label>
            <input id="pod-notes" class="form-input" value="${po.notes || ''}" />
          </div>
          <div class="form-actions" style="margin-top:0.5rem">
            <button id="pod-cancel" class="btn btn-sm">Cancel</button>
            <button id="pod-save" class="btn btn-sm btn-primary">Save Changes</button>
          </div>
        </div>
      </div>

      <!-- Check-ins -->
      ${(checkIns.pd.length || checkIns.fin.length) ? `
        <h3 style="font-size:0.85rem;margin-bottom:0.5rem">Check-ins</h3>
        <div style="margin-bottom:1rem;font-size:0.82rem">
          ${[...checkIns.pd, ...checkIns.fin]
            .sort((a, b) => (a.at || '').localeCompare(b.at || ''))
            .map(c => `
              <div style="padding:0.4rem 0;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between">
                <span><strong>${c.type === 'pd' ? 'PD' : 'FIN'}</strong> — ${c.stage} by ${c.by}</span>
                <span style="color:var(--text-dim)">${c.at ? formatDate(c.at) : '—'}</span>
              </div>
            `).join('')}
        </div>
      ` : ''}

      <!-- History -->
      ${history.length ? `
        <h3 style="font-size:0.85rem;margin-bottom:0.5rem">History</h3>
        <div style="margin-bottom:1rem;font-size:0.78rem;max-height:120px;overflow-y:auto">
          ${history.map(h => `
            <div style="padding:0.3rem 0;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between">
              <span>${h.action === 'created' ? 'Created' : `${h.from} → ${h.to}`}${h.checkedBy ? ` (${h.checkType}: ${h.checkedBy})` : ''}</span>
              <span style="color:var(--text-muted)">${h.at ? formatDate(h.at) : '—'}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Advance Stage -->
      ${nextStage ? `
        <div style="border-top:1px solid var(--border-light);padding-top:1rem">
          <div style="font-size:0.82rem;margin-bottom:0.5rem">
            <strong>Next:</strong> ${nextStage.name}
            ${nextStage.gate ? `<span style="color:var(--primary);font-weight:600"> — requires ${nextStage.gate === 'pd' ? 'PD' : 'Finance'} check-in</span>` : ''}
          </div>
          ${nextStage.gate ? `
            <div class="form-group" style="margin-bottom:0.5rem">
              <label class="form-label">Checked by</label>
              <input id="po-adv-by" class="form-input" placeholder="Name of reviewer" />
            </div>
            <div class="form-group" style="margin-bottom:0.5rem">
              <label class="form-label">Notes (optional)</label>
              <input id="po-adv-notes" class="form-input" placeholder="Review notes" />
            </div>
          ` : ''}
          <div class="form-actions" style="margin-top:0.5rem">
            <button id="po-adv-btn" class="btn btn-primary">Advance to ${nextStage.name}</button>
          </div>
        </div>
      ` : `<div style="text-align:center;color:var(--success);font-weight:600;padding:0.75rem 0">Distribution complete</div>`}
    `,
    onMount: (body) => {
      // ── Edit toggle ──
      const detailView = body.querySelector('#po-detail-view');
      const editForm = body.querySelector('#po-edit-form');
      const editToggle = body.querySelector('#po-edit-toggle');

      editToggle?.addEventListener('click', () => {
        const editing = editForm.style.display !== 'none';
        editForm.style.display = editing ? 'none' : 'block';
        detailView.style.display = editing ? 'grid' : 'none';
        editToggle.textContent = editing ? 'Edit' : 'Cancel';
      });

      body.querySelector('#pod-cancel')?.addEventListener('click', () => {
        editForm.style.display = 'none';
        detailView.style.display = 'grid';
        editToggle.textContent = 'Edit';
      });

      // Live FOB total update
      const fobInput = body.querySelector('#pod-fob');
      const unitsInput = body.querySelector('#pod-units');
      const totalDiv = body.querySelector('#pod-total');
      function updateTotal() {
        const f = parseFloat(fobInput?.value) || 0;
        const u = parseInt(unitsInput?.value) || 0;
        if (totalDiv) totalDiv.textContent = formatCurrency(f * u);
      }
      fobInput?.addEventListener('input', updateTotal);
      unitsInput?.addEventListener('input', updateTotal);

      // Save changes
      body.querySelector('#pod-save')?.addEventListener('click', async () => {
        const saveBtn = body.querySelector('#pod-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
          const updates = {
            vendor: body.querySelector('#pod-vendor')?.value || '',
            units: parseInt(body.querySelector('#pod-units')?.value) || 0,
            fob: parseFloat(body.querySelector('#pod-fob')?.value) || 0,
            notes: body.querySelector('#pod-notes')?.value || '',
            container: body.querySelector('#pod-container')?.value || null,
            vessel: body.querySelector('#pod-vessel')?.value || null,
          };
          const etd = body.querySelector('#pod-etd')?.value;
          const eta = body.querySelector('#pod-eta')?.value;
          if (etd) updates.etd = etd;
          if (eta) updates.eta = eta;

          await api.patch(`/api/purchase-orders/${po.id}`, updates);
          emit('modal:close');
          emit('toast:show', { message: `PO ${po.id} updated`, type: 'success' });
          emit('po:updated', { id: po.id });

          const posData = await api.get('/api/purchase-orders');
          state.purchaseOrders = posData.purchaseOrders || [];
          render();
          bindPOButton();
        } catch (err) {
          emit('toast:show', { message: err.message, type: 'error' });
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      });

      // ── Stage advancement ──
      if (!nextStage) return;
      body.querySelector('#po-adv-btn')?.addEventListener('click', async () => {
        const btn = body.querySelector('#po-adv-btn');
        const byInput = body.querySelector('#po-adv-by');
        const notesInput = body.querySelector('#po-adv-notes');

        if (nextStage.gate && (!byInput || !byInput.value.trim())) {
          emit('toast:show', { message: `${nextStage.gate === 'pd' ? 'PD' : 'Finance'} reviewer name required`, type: 'error' });
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Advancing...';

        try {
          const advBody = { stage: nextStage.name };
          if (byInput?.value.trim()) advBody.checkedBy = byInput.value.trim();
          if (notesInput?.value.trim()) advBody.checkNotes = notesInput.value.trim();

          await api.patch(`/api/purchase-orders/${po.id}/stage`, advBody);
          emit('modal:close');
          emit('toast:show', { message: `PO advanced to ${nextStage.name}`, type: 'success' });
          emit('po:updated', { id: po.id, stage: nextStage.name });

          // Refresh
          const posData = await api.get('/api/purchase-orders');
          state.purchaseOrders = posData.purchaseOrders || [];
          render();
          bindPOButton();
        } catch (err) {
          emit('toast:show', { message: err.message, type: 'error' });
          btn.disabled = false;
          btn.textContent = `Advance to ${nextStage.name}`;
        }
      });
    },
  });
}

function renderProduction(el) {
  const r = state.reorderPlan;
  if (!r) {
    el.innerHTML = '<div class="empty-state">Loading reorder plan...</div>';
    return;
  }

  const plan = r.plan || [];
  const actionItems = plan.filter(p => p.urgency === 'overdue' || p.urgency === 'urgent' || p.urgency === 'soon');

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Overdue</div>
        <div class="stat-value" style="${(r.summary?.overdue || 0) > 0 ? 'color:var(--danger)' : ''}">${r.summary?.overdue || 0}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">should have ordered already</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Urgent</div>
        <div class="stat-value" style="${(r.summary?.urgent || 0) > 0 ? 'color:#b38600' : ''}">${r.summary?.urgent || 0}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">order within 2 weeks</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Reorder Cost</div>
        <div class="stat-value">${formatCurrency(r.summary?.totalReorderCost || 0)}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">${formatNumber(r.summary?.totalReorderUnits || 0)} units needed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Days of Stock</div>
        <div class="stat-value">${r.summary?.avgDaysOfStock || 0}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">target: ${r.coverDays}d</div>
      </div>
    </div>

    ${actionItems.length > 0 ? `
      <h3>Action Required</h3>
      <table class="data-table" style="margin-bottom:1.5rem">
        <thead><tr>
          <th>Product</th><th>Vendor</th><th>Urgency</th>
          <th style="text-align:right">Stock</th>
          <th style="text-align:right">Incoming</th>
          <th style="text-align:right">Order By</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Cost</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${actionItems.map(p => {
            const urgColor = p.urgency === 'overdue' ? 'var(--danger)' : p.urgency === 'urgent' ? '#b38600' : 'var(--text-dim)';
            const urgLabel = p.urgency === 'overdue' ? 'OVERDUE' : p.urgency === 'urgent' ? 'URGENT' : 'SOON';
            return `
              <tr>
                <td style="font-weight:600">${p.name}</td>
                <td style="font-size:0.8rem;color:var(--text-dim)">${p.vendor || '—'}</td>
                <td><span style="color:${urgColor};font-weight:600;font-size:0.75rem">${urgLabel}</span></td>
                <td style="text-align:right;font-family:var(--font-mono);${p.currentStock === 0 ? 'color:var(--danger);font-weight:600' : ''}">${formatNumber(p.currentStock)}</td>
                <td style="text-align:right;font-family:var(--font-mono);${p.incomingUnits > 0 ? 'color:var(--success)' : ''}">${p.incomingUnits > 0 ? '+' + formatNumber(p.incomingUnits) : '—'}</td>
                <td style="text-align:right;font-size:0.8rem;color:${urgColor};font-weight:600">${p.orderByDate || '—'}</td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatNumber(p.suggestedQty)}</td>
                <td style="text-align:right">${formatCurrency(p.suggestedCost)}</td>
                <td><button class="btn btn-sm btn-primary reorder-po-btn" data-mp-id="${p.mpId}" data-units="${p.suggestedQty}" data-vendor="${p.vendor || ''}" data-fob="${p.fob || ''}">Order</button></td>
              </tr>
              ${p.activePOs?.length ? `
                <tr><td colspan="9" style="padding:0.3rem 0.75rem;font-size:0.72rem;color:var(--text-dim);background:var(--surface-2)">
                  Active POs: ${p.activePOs.map(po => `${po.id} (${po.stage}, ${formatNumber(po.units)} units)`).join(' · ')}
                </td></tr>
              ` : ''}
            `;
          }).join('')}
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
              <td style="text-align:right;font-family:var(--font-mono);${stockColor}">${p.daysOfStock >= 999 ? '\u221E' : p.daysOfStock}</td>
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
      // Re-bind PO button after render
      bindPOButton();
    });
  });
  bindPOButton();

  // Delegated clicks inside content area
  document.getElementById('cf-content')?.addEventListener('click', (e) => {
    const reorderBtn = e.target.closest('.reorder-po-btn');
    if (reorderBtn) {
      openPOFormWithPrefill(reorderBtn.dataset.mpId);
      return;
    }
    const poRow = e.target.closest('.po-row');
    if (poRow) {
      const po = state.purchaseOrders.find(p => p.id === poRow.dataset.id);
      if (po) openPODetail(po);
    }
  });
}

function bindPOButton() {
  const btn = document.getElementById('cf-new-po');
  if (btn) btn.addEventListener('click', openPOForm);
}

// ── PO Creation Form ────────────────────────────────────────

function openPOFormWithPrefill(mpId) {
  openPOForm();
  // After modal mounts, select the MP
  setTimeout(() => {
    const select = document.getElementById('po-mp');
    if (select && mpId) {
      select.value = mpId;
      select.dispatchEvent(new Event('change'));
    }
  }, 50);
}

function openPOForm() {
  const seeds = state.seeds;
  const categories = [...new Set(seeds.map(s => s.cat))];

  emit('modal:open', {
    title: 'New Purchase Order',
    wide: true,
    html: `
      <div class="form-group">
        <label class="form-label">Master Product</label>
        <select id="po-mp" class="form-select">
          <option value="">— Select MP —</option>
          ${categories.map(cat => `
            <optgroup label="${cat}">
              ${seeds.filter(s => s.cat === cat).map(s =>
                `<option value="${s.id}">${s.name} (${s.code}) — ${s.vendor || 'No vendor'}</option>`
              ).join('')}
            </optgroup>
          `).join('')}
        </select>
        <div class="form-hint">Selecting an MP auto-fills vendor, FOB, lead time, and sizing</div>
      </div>

      <div id="po-seed-info" style="display:none;background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--radius);padding:0.75rem;margin-bottom:1rem;font-size:0.82rem">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Vendor</label>
          <input id="po-vendor" class="form-input" placeholder="Vendor name" />
        </div>
        <div class="form-group">
          <label class="form-label">Units</label>
          <input id="po-units" type="number" class="form-input" placeholder="0" min="0" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">FOB ($)</label>
          <input id="po-fob" type="number" step="0.01" class="form-input" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label">ETD</label>
          <input id="po-etd" type="date" class="form-input" />
        </div>
      </div>

      <div id="po-total" style="font-size:0.85rem;color:var(--text-dim);margin-bottom:0.5rem"></div>

      <div class="form-group">
        <label class="form-label">Notes</label>
        <input id="po-notes" class="form-input" placeholder="Optional notes" />
      </div>

      <div class="form-actions">
        <button id="po-cancel" class="btn btn-secondary">Cancel</button>
        <button id="po-submit" class="btn btn-primary">Create PO</button>
      </div>
    `,
    onMount: (body) => {
      const mpSelect = body.querySelector('#po-mp');
      const vendorInput = body.querySelector('#po-vendor');
      const unitsInput = body.querySelector('#po-units');
      const fobInput = body.querySelector('#po-fob');
      const etdInput = body.querySelector('#po-etd');
      const notesInput = body.querySelector('#po-notes');
      const seedInfo = body.querySelector('#po-seed-info');
      const totalDiv = body.querySelector('#po-total');

      function updateTotal() {
        const fob = parseFloat(fobInput.value) || 0;
        const units = parseInt(unitsInput.value) || 0;
        const total = fob * units;
        totalDiv.textContent = total > 0 ? `FOB Total: ${formatCurrency(total)}` : '';
      }

      fobInput.addEventListener('input', updateTotal);
      unitsInput.addEventListener('input', updateTotal);

      // Auto-fill from MP seed
      mpSelect.addEventListener('change', () => {
        const seed = seeds.find(s => s.id === mpSelect.value);
        if (seed) {
          vendorInput.value = seed.vendor || '';
          fobInput.value = seed.fob || '';
          seedInfo.style.display = 'block';
          seedInfo.innerHTML = `
            <strong>${seed.name}</strong> (${seed.code})<br>
            MOQ: ${seed.moq || '—'} · Lead: ${seed.lead || '—'}d ·
            HTS: ${seed.hts || '—'} · Duty: ${seed.duty || 0}% ·
            Sizes: ${seed.sizes || '—'}
            ${seed.fits?.length ? `<br>Fits: ${seed.fits.join(', ')}` : ''}
          `;
          updateTotal();
        } else {
          seedInfo.style.display = 'none';
        }
      });

      body.querySelector('#po-cancel').addEventListener('click', () => emit('modal:close'));

      body.querySelector('#po-submit').addEventListener('click', async () => {
        const mpId = mpSelect.value || null;
        const vendor = vendorInput.value.trim();
        const units = parseInt(unitsInput.value) || 0;
        const fob = parseFloat(fobInput.value) || 0;

        if (!mpId && !vendor) {
          emit('toast:show', { message: 'Select an MP or enter a vendor', type: 'error' });
          return;
        }

        const submitBtn = body.querySelector('#po-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
          const poData = { mpId, vendor, units, fob };
          if (etdInput.value) poData.etd = etdInput.value;
          if (notesInput.value.trim()) poData.notes = notesInput.value.trim();

          const result = await api.post('/api/purchase-orders', poData);
          emit('modal:close');
          emit('toast:show', { message: `PO ${result.purchaseOrder.id} created`, type: 'success' });
          emit('po:created', result.purchaseOrder);

          // Refresh PO list
          const posData = await api.get('/api/purchase-orders');
          state.purchaseOrders = posData.purchaseOrders || [];
          render();
          bindPOButton();
        } catch (err) {
          emit('toast:show', { message: err.message, type: 'error' });
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create PO';
        }
      });
    },
  });
}

// Listen for PO creation triggered from marketplace detail view
on('po:create-from-mp', ({ mpId }) => {
  // Wait a tick for cash-flow module to init after nav:change
  setTimeout(() => {
    state.view = 'pos';
    render();
    bindPOButton();
    openPOFormWithPrefill(mpId);
  }, 100);
});

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
  state = { loaded: false, salesData: null, reorderPlan: null, purchaseOrders: [], stages: [], seeds: [], ledger: [], view: 'overview' };
}
