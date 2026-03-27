/**
 * Vendors Module — Vendor management, PO rollup, scoring, product lines
 *
 * Aggregates from /api/products/seeds + /api/purchase-orders.
 * Computes vendor scores from PO delivery data:
 *   - onTime%: POs with ETA that arrived by/before ETA
 *   - avgLead: average lead time across vendor's MPs
 *   - qualScore: derived from PO stage progression + QC pass rate
 *   - tier: Strategic / Preferred / Standard / Probation
 *
 * Subscribes: sync:complete, po:created, po:updated
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, formatDate, skeleton, esc } from './core.js';

// ── Constants ──────────────────────────────────────────────

const VENDOR_TIERS = Object.freeze([
  Object.freeze({ name: 'Strategic',     minScore: 80, color: '#16a34a', desc: 'Core partner, long-term' }),
  Object.freeze({ name: 'Preferred',     minScore: 60, color: '#3b82f6', desc: 'Reliable, competitive' }),
  Object.freeze({ name: 'Standard',      minScore: 40, color: '#94a3b8', desc: 'Adequate, fill orders' }),
  Object.freeze({ name: 'Probation',     minScore: 0,  color: '#dc2626', desc: 'Issues — needs review' }),
]);

const COMPLETED_STAGES = Object.freeze(['Received', 'Distribution']);
const MS_PER_DAY = 86_400_000;

function getTier(score) {
  return VENDOR_TIERS.find(t => score >= t.minScore) || VENDOR_TIERS[VENDOR_TIERS.length - 1];
}

// ── Module State ───────────────────────────────────────────

let state = { loaded: false, vendors: [] };
let _container = null;
let _unsubs = [];

// ── Lifecycle ──────────────────────────────────────────────

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Vendors</h2>
    </div>
    <div id="vendor-content">${skeleton(6)}</div>
  `;

  await loadData();

  _unsubs.push(on('sync:complete', () => { if (_container) loadData(); }));
  _unsubs.push(on('po:created', () => { if (_container) loadData(); }));
  _unsubs.push(on('po:updated', () => { if (_container) loadData(); }));
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  _container = null;
  state = { loaded: false, vendors: [] };
}

// ── Data ───────────────────────────────────────────────────

async function loadData() {
  const el = document.getElementById('vendor-content');
  if (!el || !_container) return;

  try {
    const [seeds, pos] = await Promise.all([
      api.get('/api/products/seeds'),
      api.get('/api/purchase-orders'),
    ]);
    if (!_container) return;
    state.vendors = buildVendorView(seeds.seeds || [], pos.purchaseOrders || []);
    state.loaded = true;
    render();
  } catch (err) {
    if (!_container) return;
    el.innerHTML = `<div class="empty-state">Failed to load vendor data: ${esc(err.message)}</div>`;
  }
}

// ── Scoring Engine ─────────────────────────────────────────

function computeVendorScore(vendor) {
  const pos = vendor.pos;
  if (pos.length === 0) return { onTime: null, qualScore: null, overallScore: 50, tier: getTier(50) };

  // On-time delivery: % of completed POs where arrivedAt <= ETA
  const completedWithETA = pos.filter(po =>
    COMPLETED_STAGES.includes(po.stage) && po.eta
  );
  let onTime = null;
  if (completedWithETA.length > 0) {
    const onTimeCount = completedWithETA.filter(po => {
      const arrived = po.arrivedAt || po.updatedAt;
      if (!arrived) return false;
      return new Date(arrived) <= new Date(po.eta);
    }).length;
    onTime = Math.round(onTimeCount / completedWithETA.length * 100);
  }

  // Quality score: based on PO progression depth
  // POs that reach QC/Received/Distribution are higher quality
  const STAGE_QUALITY = { Concept: 10, Design: 20, Sample: 30, Approved: 40, Costed: 50,
    Ordered: 55, Production: 60, QC: 70, Shipped: 75, 'In Transit': 80, Received: 90, Distribution: 100 };
  const avgStageDepth = pos.length > 0
    ? Math.round(pos.reduce((s, po) => s + (STAGE_QUALITY[po.stage] || 10), 0) / pos.length)
    : 50;

  // Overall: weighted blend
  const onTimeWeight = onTime !== null ? 0.5 : 0;
  const qualWeight = 1 - onTimeWeight;
  const overallScore = Math.round(
    (onTime !== null ? onTime * onTimeWeight : 0) +
    avgStageDepth * qualWeight
  );

  return {
    onTime,
    qualScore: avgStageDepth,
    overallScore,
    tier: getTier(overallScore),
  };
}

// ── Build View ─────────────────────────────────────────────

function buildVendorView(seeds, pos) {
  const vendors = {};

  for (const seed of seeds) {
    const v = seed.vendor || 'Unknown';
    if (!vendors[v]) {
      vendors[v] = {
        name: v, products: [], categories: new Set(), totalMPs: 0,
        avgFob: 0, avgLead: 0, pos: [],
        activePOCost: 0, activePOUnits: 0, totalPOCost: 0,
        preferredTerms: 'standard',
      };
    }
    vendors[v].products.push({ id: seed.id, name: seed.name, code: seed.code, cat: seed.cat, fob: seed.fob });
    vendors[v].categories.add(seed.cat);
    vendors[v].totalMPs++;
  }

  for (const v of Object.values(vendors)) {
    const fobs = v.products.map(p => p.fob).filter(f => f > 0);
    const leads = seeds.filter(s => (s.vendor || 'Unknown') === v.name && s.lead > 0).map(s => s.lead);
    v.avgFob = fobs.length ? +(fobs.reduce((a, b) => a + b, 0) / fobs.length).toFixed(2) : 0;
    v.avgLead = leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : 0;
    v.categories = [...v.categories];
  }

  for (const po of pos) {
    const v = po.vendor || 'Unknown';
    if (!vendors[v]) continue;
    vendors[v].pos.push(po);
    vendors[v].totalPOCost += (Number(po.fobTotal) || 0);
    if (!COMPLETED_STAGES.includes(po.stage)) {
      vendors[v].activePOCost += (Number(po.fobTotal) || 0);
      vendors[v].activePOUnits += (Number(po.units) || 0);
    }
  }

  // Compute scores
  for (const v of Object.values(vendors)) {
    v.score = computeVendorScore(v);
  }

  return Object.values(vendors).sort((a, b) => b.score.overallScore - a.score.overallScore);
}

// ── Render ─────────────────────────────────────────────────

function render() {
  const el = document.getElementById('vendor-content');
  if (!el || !state.loaded || !_container) return;

  const vendors = state.vendors;
  const totalActiveCost = vendors.reduce((s, v) => s + v.activePOCost, 0);
  const totalMPs = vendors.reduce((s, v) => s + v.totalMPs, 0);

  // Tier distribution
  const tierCounts = {};
  for (const v of vendors) {
    const t = v.score.tier.name;
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Vendors</div>
        <div class="stat-value">${vendors.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Product Lines</div>
        <div class="stat-value">${totalMPs}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active PO Cost</div>
        <div class="stat-value">${formatCurrency(totalActiveCost)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tier Distribution</div>
        <div style="display:flex;gap:0.4rem;margin-top:0.35rem;flex-wrap:wrap">
          ${VENDOR_TIERS.filter(t => tierCounts[t.name]).map(t => `
            <span style="font-size:0.72rem;font-weight:600;padding:0.1rem 0.4rem;border-radius:3px;background:${t.color}20;color:${t.color}">${esc(t.name)} ${tierCounts[t.name]}</span>
          `).join('')}
        </div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:1rem">
      ${vendors.map((v, idx) => renderVendorCard(v, idx)).join('')}
    </div>
  `;

  // Bind expand toggles via delegation
  el.querySelectorAll('.vendor-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const detail = btn.closest('.vendor-card')?.querySelector('.vendor-detail');
      if (detail) detail.classList.toggle('open');
    });
  });
}

function renderVendorCard(v, idx) {
  const { tier, onTime, qualScore, overallScore } = v.score;
  const activePOs = v.pos.filter(p => !COMPLETED_STAGES.includes(p.stage));

  return `
    <div class="vendor-card" style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);overflow:hidden">
      <div class="vendor-toggle" style="padding:1rem;display:flex;justify-content:space-between;align-items:flex-start;cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.25rem">
            <span style="font-weight:700;font-size:1rem">${esc(v.name)}</span>
            <span style="font-size:0.68rem;font-weight:700;padding:0.1rem 0.45rem;border-radius:3px;background:${tier.color}15;color:${tier.color};border:1px solid ${tier.color}30">${esc(tier.name)}</span>
          </div>
          <div style="font-size:0.78rem;color:var(--text-dim)">
            ${v.totalMPs} MPs · ${esc(v.categories.join(', '))} · avg lead ${v.avgLead}d · terms: ${esc(v.preferredTerms)}
          </div>
          <!-- Score bar -->
          <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem">
            <div style="flex:1;max-width:200px;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${overallScore}%;background:${tier.color};border-radius:3px;transition:width .3s"></div>
            </div>
            <span style="font-size:0.72rem;font-family:var(--font-mono);color:${tier.color};font-weight:600">${overallScore}</span>
            ${onTime !== null ? `<span style="font-size:0.68rem;color:var(--text-dim)">OT ${onTime}%</span>` : ''}
            ${qualScore !== null ? `<span style="font-size:0.68rem;color:var(--text-dim)">QS ${qualScore}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:1rem">
          <div style="font-family:var(--font-mono);font-weight:600">${formatCurrency(v.activePOCost)}</div>
          <div style="font-size:0.72rem;color:var(--text-dim)">
            ${activePOs.length} active · ${formatNumber(v.activePOUnits)} units
          </div>
        </div>
      </div>
      <div class="vendor-detail" style="display:none;border-top:1px solid var(--border-light);padding:0.75rem">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-dim);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em">Products</div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.75rem">
          ${v.products.map(p => `
            <span style="font-size:0.75rem;padding:0.2rem 0.5rem;background:var(--surface-2);border:1px solid var(--border-light);border-radius:4px">
              ${esc(p.code)} \u2014 ${formatCurrency(p.fob)}
            </span>
          `).join('')}
        </div>
        ${v.pos.length > 0 ? `
          <div style="font-size:0.78rem;font-weight:600;color:var(--text-dim);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em">Purchase Orders (${v.pos.length})</div>
          <table class="data-table" style="font-size:0.8rem">
            <thead><tr><th>PO</th><th>Product</th><th>Stage</th><th style="text-align:right">Units</th><th style="text-align:right">Cost</th><th>ETA</th></tr></thead>
            <tbody>
              ${v.pos.map(po => `
                <tr>
                  <td style="font-family:var(--font-mono)">${esc(po.id)}</td>
                  <td>${esc(po.mpName || po.mpCode) || '\u2014'}</td>
                  <td><span class="po-stage-badge ${COMPLETED_STAGES.includes(po.stage) ? 'late' : 'mid'}">${esc(po.stage || 'Concept')}</span></td>
                  <td style="text-align:right">${formatNumber(po.units || 0)}</td>
                  <td style="text-align:right">${formatCurrency(po.fobTotal || 0)}</td>
                  <td style="font-size:0.75rem;color:var(--text-dim)">${po.eta ? formatDate(po.eta) : '\u2014'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="font-size:0.82rem;color:var(--text-dim)">No purchase orders</div>'}
      </div>
    </div>
  `;
}
