/**
 * Analytics Module — MP velocity charts, category breakdown, trends
 * 
 * API endpoints:
 *   GET /api/orders/mp-velocity?days=30  → velocity by MP
 *   GET /api/orders/sales?days=30        → revenue with daily breakdown
 *   GET /api/products/masters            → MP catalog for enrichment
 * 
 * Subscribes: sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, skeleton } from './core.js';

let state = { loaded: false, velocity: null, sales: null, days: 30 };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Analytics</h2>
      <div class="module-tabs">
        <button class="tab active" data-days="7">7d</button>
        <button class="tab" data-days="30">30d</button>
        <button class="tab" data-days="90">90d</button>
      </div>
    </div>
    <div id="analytics-content">${skeleton(8)}</div>
  `;

  await loadData(30);
  bindEvents();
}

async function loadData(days) {
  state.days = days;
  const el = document.getElementById('analytics-content');
  if (!el) return;
  el.innerHTML = skeleton(8);

  try {
    const [vel, sales] = await Promise.all([
      api.get('/api/orders/mp-velocity', { days }),
      api.get('/api/orders/sales', { days }),
    ]);
    state.velocity = vel;
    state.sales = sales;
    state.loaded = true;
    render();
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load analytics: ${err.message}</div>`;
  }
}

function render() {
  const el = document.getElementById('analytics-content');
  if (!el || !state.loaded) return;

  const v = state.velocity;
  const s = state.sales;
  const days = state.days;
  const mpList = v?.velocity || [];
  const dailySales = s?.dailySales || [];

  // Category breakdown
  const byCat = {};
  for (const mp of mpList) {
    if (!byCat[mp.cat]) byCat[mp.cat] = { units: 0, revenue: 0, count: 0 };
    byCat[mp.cat].units += mp.units;
    byCat[mp.cat].revenue += mp.revenue;
    byCat[mp.cat].count++;
  }
  const cats = Object.entries(byCat).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxCatRev = cats.length ? cats[0][1].revenue : 1;

  // Daily revenue for chart
  const maxDailyRev = dailySales.length ? Math.max(...dailySales.map(d => d.revenue || 0), 1) : 1;

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Revenue (${days}d)</div>
        <div class="stat-value">${formatCurrency(s?.totalRevenue || 0)}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">${formatNumber(s?.totalOrders || 0)} orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Units Sold</div>
        <div class="stat-value">${formatNumber(v?.summary?.totalUnits || 0)}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">${mpList.length} active MPs</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Order</div>
        <div class="stat-value">${formatCurrency(s?.avgOrderValue || 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Revenue/Day</div>
        <div class="stat-value">${formatCurrency((s?.totalRevenue || 0) / days)}</div>
      </div>
    </div>

    <!-- Demand Signals + Seasonal Indicator -->
    ${v?.summary?.signals ? `
      <div style="display:flex;gap:0.75rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap">
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${v.summary.signals.hot ? `<span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:10px;background:#fee2e2;color:#b91c1c;font-weight:600">🔥 ${v.summary.signals.hot} Hot</span>` : ''}
          ${v.summary.signals.rising ? `<span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:10px;background:#dcfce7;color:#15803d;font-weight:600">📈 ${v.summary.signals.rising} Rising</span>` : ''}
          ${v.summary.signals.slow ? `<span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">📉 ${v.summary.signals.slow} Slow</span>` : ''}
          <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:10px;background:var(--surface-2);color:var(--text-dim)">${v.summary.signals.steady || 0} Steady</span>
        </div>
        ${v.seasonalMultiplier ? `
          <div style="font-size:0.72rem;color:var(--text-dim);margin-left:auto">
            Season: ${v.seasonalMultiplier}x
            ${v.seasonalMultiplier > 1.2 ? ' 📈' : v.seasonalMultiplier < 0.9 ? ' 📉' : ''}
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- Daily Revenue Chart -->
    ${dailySales.length ? `
      <h3 style="margin-bottom:0.5rem">Daily Revenue</h3>
      <div class="daily-chart" style="display:flex;align-items:flex-end;gap:2px;height:120px;margin-bottom:1.5rem;
        background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:0.75rem">
        ${dailySales.map(d => {
          const pct = Math.max(2, ((d.revenue || 0) / maxDailyRev) * 100);
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%" title="${d.date}: ${formatCurrency(d.revenue || 0)}">
            <div style="width:100%;min-width:3px;background:var(--primary);border-radius:2px 2px 0 0;height:${pct}%;transition:height .2s"></div>
          </div>`;
        }).join('')}
      </div>
    ` : ''}

    <!-- Category Breakdown -->
    <h3 style="margin-bottom:0.5rem">Revenue by Category</h3>
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.5rem">
      ${cats.map(([cat, data]) => `
        <div style="display:flex;align-items:center;gap:0.75rem">
          <div style="width:80px;font-weight:600;font-size:0.85rem;flex-shrink:0">${cat}</div>
          <div style="flex:1;height:24px;background:var(--surface-2);border-radius:4px;overflow:hidden;position:relative">
            <div style="height:100%;width:${(data.revenue / maxCatRev * 100).toFixed(1)}%;background:var(--primary);border-radius:4px;transition:width .3s"></div>
          </div>
          <div style="width:90px;text-align:right;font-family:var(--font-mono);font-size:0.82rem">${formatCurrency(data.revenue)}</div>
          <div style="width:60px;text-align:right;font-size:0.75rem;color:var(--text-dim)">${formatNumber(data.units)} u</div>
        </div>
      `).join('')}
    </div>

    <!-- Top MPs by Revenue -->
    <h3 style="margin-bottom:0.5rem">Top Products by Revenue</h3>
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Product</th><th>Signal</th><th>Category</th>
        <th style="text-align:right">Units</th>
        <th style="text-align:right">Revenue</th>
        <th style="text-align:right">/Week</th>
        <th style="text-align:right">Avg Price</th>
        <th style="text-align:right">Margin</th>
      </tr></thead>
      <tbody>
        ${mpList.slice(0, 20).map((mp, i) => {
          const sigMap = { hot: '🔥', rising: '📈', slow: '📉', steady: '—', stockout: '⚠' };
          const sigColor = { hot: '#b91c1c', rising: '#15803d', slow: '#1d4ed8', steady: 'var(--text-muted)', stockout: '#b91c1c' };
          return `
          <tr>
            <td style="color:var(--text-dim);font-size:0.78rem">${i + 1}</td>
            <td style="font-weight:600">${mp.name}</td>
            <td style="font-size:0.78rem;color:${sigColor[mp.signal] || 'var(--text-dim)'}">${sigMap[mp.signal] || '—'} ${mp.signal || ''}</td>
            <td style="font-size:0.78rem;color:var(--text-dim)">${mp.cat}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(mp.units)}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatCurrency(mp.revenue)}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${mp.velocityPerWeek || mp.unitsPerDay}</td>
            <td style="text-align:right">${formatCurrency(mp.avgPrice)}</td>
            <td style="text-align:right">${mp.margin !== null ? mp.margin + '%' : '—'}</td>
          </tr>
        `}).join('')}
      </tbody>
    </table>

    ${(v?.summary?.unmatchedUnits || 0) > 0 ? `
      <div style="margin-top:0.75rem;font-size:0.78rem;color:var(--text-dim)">
        ${formatNumber(v.summary.unmatchedUnits)} units (${formatCurrency(v.summary.unmatchedRevenue)}) from unmatched Shopify products
      </div>
    ` : ''}
  `;
}

function bindEvents() {
  _container?.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadData(parseInt(tab.dataset.days));
    });
  });
}

on('sync:complete', async () => {
  if (!_container) return;
  loadData(state.days);
});

export function destroy() {
  _container = null;
  state = { loaded: false, velocity: null, sales: null, days: 30 };
}
