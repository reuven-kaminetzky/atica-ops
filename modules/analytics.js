/**
 * Analytics Module — MP velocity charts, category breakdown, trend lines
 *
 * API endpoints:
 *   GET /api/orders/mp-velocity?days=30  → velocity by MP
 *   GET /api/orders/sales?days=30        → revenue with daily breakdown
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

// ── Trend line (linear regression) ─────────────────────────

function trendLine(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, values: points.map(p => p.y) };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i].y;
    sumXY += i * points[i].y;
    sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return {
    slope,
    intercept,
    values: points.map((_, i) => intercept + slope * i),
  };
}

// ── SVG chart helpers ──────────────────────────────────────

function svgRevenueChart(dailySales, width, height) {
  if (!dailySales.length) return '';
  const pad = { top: 10, right: 10, bottom: 24, left: 50 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const maxRev = Math.max(...dailySales.map(d => d.revenue || 0), 1);
  const points = dailySales.map((d, i) => ({
    x: pad.left + (i / Math.max(dailySales.length - 1, 1)) * w,
    y: pad.top + h - ((d.revenue || 0) / maxRev) * h,
    revenue: d.revenue || 0,
    date: d.date,
  }));

  // Area + line path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${pad.top + h} L${points[0].x.toFixed(1)},${pad.top + h} Z`;

  // Trend line
  const trend = trendLine(dailySales.map(d => ({ y: d.revenue || 0 })));
  const trendPts = trend.values.map((v, i) => ({
    x: pad.left + (i / Math.max(dailySales.length - 1, 1)) * w,
    y: pad.top + h - (Math.max(0, v) / maxRev) * h,
  }));
  const trendPath = trendPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const trendDir = trend.slope > 0 ? 'up' : trend.slope < 0 ? 'down' : 'flat';

  // Y-axis labels
  const yLabels = [0, 0.5, 1].map(pct => {
    const val = maxRev * pct;
    const y = pad.top + h - pct * h;
    return `<text x="${pad.left - 6}" y="${y + 4}" text-anchor="end" fill="var(--text-dim)" font-size="10">${formatCompact(val)}</text>
      <line x1="${pad.left}" y1="${y}" x2="${pad.left + w}" y2="${y}" stroke="var(--border-light)" stroke-dasharray="3,3"/>`;
  });

  // X-axis labels (first, mid, last)
  const xIndices = [0, Math.floor(dailySales.length / 2), dailySales.length - 1];
  const xLabels = xIndices.map(i => {
    if (!dailySales[i]) return '';
    return `<text x="${points[i].x}" y="${pad.top + h + 16}" text-anchor="middle" fill="var(--text-dim)" font-size="10">${dailySales[i].date.slice(5)}</text>`;
  });

  // Hover circles
  const circles = points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--primary)" opacity="0" style="transition:opacity .15s">
      <title>${p.date}: ${formatCurrency(p.revenue)}</title>
    </circle>`
  );

  return `
    <div style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem">
        <h3 style="margin:0">Daily Revenue</h3>
        <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:10px;
          background:${trendDir === 'up' ? 'rgba(34,197,94,0.12)' : trendDir === 'down' ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)'};
          color:${trendDir === 'up' ? '#16a34a' : trendDir === 'down' ? '#dc2626' : '#64748b'}">
          ${trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→'} trend
        </span>
      </div>
      <svg width="100%" viewBox="0 0 ${width} ${height}" style="background:var(--surface-2);border:1px solid var(--border-light);border-radius:var(--radius-lg);overflow:visible"
        onmouseover="this.querySelectorAll('circle').forEach(c=>c.style.opacity=1)"
        onmouseout="this.querySelectorAll('circle').forEach(c=>c.style.opacity=0)">
        ${yLabels.join('')}
        ${xLabels.join('')}
        <path d="${areaPath}" fill="var(--primary)" opacity="0.08"/>
        <path d="${linePath}" fill="none" stroke="var(--primary)" stroke-width="2"/>
        <path d="${trendPath}" fill="none" stroke="${trendDir === 'up' ? '#16a34a' : trendDir === 'down' ? '#dc2626' : '#64748b'}" stroke-width="1.5" stroke-dasharray="6,4"/>
        ${circles.join('')}
      </svg>
    </div>
  `;
}

function formatCompact(n) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(n);
}

// ── Category velocity trend (sparklines) ───────────────────

function categorySparkline(dailySales, cat, mpList) {
  // Build daily units for this category from the mp velocity data
  // We don't have daily category breakdown from the API, so show a revenue bar
  const mpIds = mpList.filter(m => m.cat === cat).map(m => m.mpId);
  const totalUnits = mpList.filter(m => m.cat === cat).reduce((s, m) => s + m.units, 0);
  const totalRev = mpList.filter(m => m.cat === cat).reduce((s, m) => s + m.revenue, 0);
  return { totalUnits, totalRev, mpCount: mpIds.length };
}

// ── Render ─────────────────────────────────────────────────

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

  // Velocity trend data
  const avgDailyRev = dailySales.length
    ? dailySales.reduce((s, d) => s + (d.revenue || 0), 0) / dailySales.length
    : 0;

  el.innerHTML = `
    <!-- Summary Cards -->
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
        <div class="stat-label">Avg Daily</div>
        <div class="stat-value">${formatCurrency(avgDailyRev)}</div>
        <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">${formatNumber(Math.round((v?.summary?.totalUnits || 0) / Math.max(days, 1)))} units/day</div>
      </div>
    </div>

    <!-- Daily Revenue SVG Chart with Trend Line -->
    ${svgRevenueChart(dailySales, 640, 200)}

    <!-- Category Breakdown with Revenue Bars -->
    <h3 style="margin-bottom:0.5rem">Revenue by Category</h3>
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.5rem">
      ${cats.map(([cat, data]) => {
        const pct = (data.revenue / maxCatRev * 100).toFixed(1);
        const unitsPerDay = (data.units / Math.max(days, 1)).toFixed(1);
        return `
        <div style="display:flex;align-items:center;gap:0.75rem">
          <div style="width:80px;font-weight:600;font-size:0.85rem;flex-shrink:0">${cat}</div>
          <div style="flex:1;height:28px;background:var(--surface-2);border-radius:4px;overflow:hidden;position:relative">
            <div style="height:100%;width:${pct}%;background:var(--primary);border-radius:4px;transition:width .3s"></div>
            <span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:0.72rem;color:var(--text-dim)">${data.count} MPs &middot; ${unitsPerDay} u/d</span>
          </div>
          <div style="width:90px;text-align:right;font-family:var(--font-mono);font-size:0.82rem">${formatCurrency(data.revenue)}</div>
          <div style="width:60px;text-align:right;font-size:0.75rem;color:var(--text-dim)">${formatNumber(data.units)} u</div>
        </div>`;
      }).join('')}
    </div>

    <!-- MP Velocity Table -->
    <h3 style="margin-bottom:0.5rem">Top Products by Revenue</h3>
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Product</th><th>Category</th>
        <th style="text-align:right">Units</th>
        <th style="text-align:right">Revenue</th>
        <th style="text-align:right">Units/Day</th>
        <th style="text-align:right">Projected/Mo</th>
        <th style="text-align:right">Avg Price</th>
        <th style="text-align:right">Margin</th>
      </tr></thead>
      <tbody>
        ${mpList.slice(0, 25).map((mp, i) => `
          <tr>
            <td style="color:var(--text-dim);font-size:0.78rem">${i + 1}</td>
            <td style="font-weight:600">${mp.name}</td>
            <td style="font-size:0.78rem;color:var(--text-dim)">${mp.cat}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(mp.units)}</td>
            <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatCurrency(mp.revenue)}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${mp.unitsPerDay}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(mp.projectedMonthly)}</td>
            <td style="text-align:right">${formatCurrency(mp.avgPrice)}</td>
            <td style="text-align:right">${mp.margin !== null ? mp.margin + '%' : '—'}</td>
          </tr>
        `).join('')}
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

on('sync:complete', () => {
  if (!_container) return;
  loadData(state.days);
});

export function destroy() {
  _container = null;
  state = { loaded: false, velocity: null, sales: null, days: 30 };
}
