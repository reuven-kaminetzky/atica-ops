/**
 * Customers Module — CRM from Shopify order data
 *
 * API endpoints:
 *   GET /api/customers              → list customers
 *   GET /api/customers/:id          → single customer with order history
 *   GET /api/customers/top?days=90  → top customers by spend
 *   GET /api/customers/segments     → customer segments (new/returning/vip/dormant)
 *
 * Subscribes: sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatNumber, formatDate, skeleton, esc } from './core.js';

// ── Constants ──────────────────────────────────────────────

const DEFAULT_DAYS = 90;
const TOP_LIMIT = 50;
const ORDER_HISTORY_LIMIT = 20;

const LOYALTY_TIERS = Object.freeze([
  Object.freeze({ name: 'Diamond',  min: 5000, discount: 20, points: 3.0, color: '#60a5fa' }),
  Object.freeze({ name: 'Platinum', min: 3000, discount: 15, points: 2.5, color: '#a78bfa' }),
  Object.freeze({ name: 'Gold',     min: 1500, discount: 10, points: 2.0, color: '#fbbf24' }),
  Object.freeze({ name: 'Silver',   min: 500,  discount: 5,  points: 1.5, color: '#94a3b8' }),
  Object.freeze({ name: 'Bronze',   min: 0,    discount: 0,  points: 1.0, color: '#d97706' }),
]);

const SEGMENT_COLORS = Object.freeze({
  new: 'var(--info)',
  returning: 'var(--success)',
  vip: '#fbbf24',
  dormant: 'var(--danger)',
});

/** Returns the loyalty tier for a given spend amount. */
function getTier(spend) {
  const amount = Number(spend) || 0;
  return LOYALTY_TIERS.find(t => amount >= t.min) || LOYALTY_TIERS[LOYALTY_TIERS.length - 1];
}

// ── Module State ───────────────────────────────────────────

let state = { loaded: false, view: 'top', customers: [], segments: null, topCustomers: [] };
let _container = null;
let _unsub = null;

// ── Lifecycle ──────────────────────────────────────────────

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Customers</h2>
      <div class="module-tabs">
        <button class="tab active" data-view="top">Top Spenders</button>
        <button class="tab" data-view="segments">Segments</button>
        <button class="tab" data-view="list">All</button>
      </div>
    </div>
    <div id="cust-content">${skeleton(8)}</div>
  `;

  bindTabs();
  _unsub = on('sync:complete', () => { if (_container) loadData(); });
  await loadData();
}

export function destroy() {
  if (_unsub) _unsub();
  _unsub = null;
  _container = null;
  state = { loaded: false, view: 'top', customers: [], segments: null, topCustomers: [] };
}

// ── Data ───────────────────────────────────────────────────

async function loadData() {
  const el = document.getElementById('cust-content');
  if (!el || !_container) return;
  el.innerHTML = skeleton(8);

  try {
    const [top, segments] = await Promise.allSettled([
      api.get('/api/customers/top', { days: DEFAULT_DAYS }),
      api.get('/api/customers/segments', { days: DEFAULT_DAYS }),
    ]);
    if (!_container) return; // destroyed during await
    state.topCustomers = top.status === 'fulfilled' ? (top.value.customers || []) : [];
    state.segments = segments.status === 'fulfilled' ? segments.value : null;
    state.loaded = true;
    render();
  } catch (err) {
    if (!_container) return;
    el.innerHTML = `<div class="empty-state">Failed to load customers: ${esc(err.message)}</div>`;
  }
}

function render() {
  const el = document.getElementById('cust-content');
  if (!el || !state.loaded || !_container) return;

  if (state.view === 'top') renderTop(el);
  else if (state.view === 'segments') renderSegments(el);
  else renderList(el);
}

// ── Top Spenders View ──────────────────────────────────────

function renderTop(el) {
  const customers = state.topCustomers;
  const totalSpend = customers.reduce((s, c) => s + (Number(c.spend) || 0), 0);

  const tierCounts = {};
  for (const c of customers) {
    const tier = getTier(c.spend);
    tierCounts[tier.name] = (tierCounts[tier.name] || 0) + 1;
  }

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Top Customers (${DEFAULT_DAYS}d)</div>
        <div class="stat-value">${customers.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Spend</div>
        <div class="stat-value">${formatCurrency(totalSpend)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Spend</div>
        <div class="stat-value">${formatCurrency(customers.length > 0 ? totalSpend / customers.length : 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tier Breakdown</div>
        <div style="display:flex;gap:0.4rem;margin-top:0.35rem;flex-wrap:wrap">
          ${LOYALTY_TIERS.filter(t => tierCounts[t.name]).map(t => `
            <span style="font-size:0.72rem;font-weight:600;padding:0.1rem 0.4rem;border-radius:3px;background:${t.color}20;color:${t.color}">${esc(t.name)} ${tierCounts[t.name]}</span>
          `).join('')}
        </div>
      </div>
    </div>

    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Customer</th><th>Tier</th>
        <th style="text-align:right">Spend</th>
        <th style="text-align:right">Orders</th>
        <th style="text-align:right">Avg Order</th>
        <th style="text-align:right">Units</th>
        <th>Last Order</th>
      </tr></thead>
      <tbody>
        ${customers.slice(0, TOP_LIMIT).map((c, i) => {
          const tier = getTier(c.spend);
          return `
            <tr class="cust-row" data-id="${esc(c.id)}" style="cursor:pointer">
              <td style="color:var(--text-dim);font-size:0.78rem">${i + 1}</td>
              <td>
                <div style="font-weight:600">${esc(c.name) || 'Guest'}</div>
                ${c.email ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(c.email)}</div>` : ''}
              </td>
              <td><span style="font-size:0.68rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:3px;background:${tier.color}20;color:${tier.color}">${esc(tier.name)}</span></td>
              <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatCurrency(c.spend)}</td>
              <td style="text-align:right;font-family:var(--font-mono)">${Number(c.orders) || 0}</td>
              <td style="text-align:right">${formatCurrency(c.avgOrder)}</td>
              <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(c.units)}</td>
              <td style="font-size:0.78rem;color:var(--text-dim)">${c.lastOrder ? formatDate(c.lastOrder) : '\u2014'}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  el.querySelectorAll('.cust-row').forEach(row => {
    row.addEventListener('click', () => openCustomerDetail(row.dataset.id));
  });
}

// ── Segments View ──────────────────────────────────────────

function renderSegments(el) {
  const seg = state.segments;
  if (!seg) {
    el.innerHTML = '<div class="empty-state">No segment data</div>';
    return;
  }

  const segments = seg.segments || [];
  const total = seg.totalCustomers || 0;

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Customers (${DEFAULT_DAYS}d)</div>
        <div class="stat-value">${formatNumber(total)}</div>
      </div>
      ${segments.map(s => `
        <div class="stat-card">
          <div class="stat-label" style="text-transform:capitalize">${esc(s.name)}</div>
          <div class="stat-value" style="color:${SEGMENT_COLORS[s.name] || 'var(--text)'}">${Number(s.count) || 0}</div>
          <div class="stat-card-sub">${Number(s.pct) || 0}% · ${formatCurrency(s.revenue)}</div>
        </div>
      `).join('')}
    </div>

    <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:1.25rem">
      <h3>Segment Breakdown</h3>
      <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin:0.75rem 0">
        ${segments.map(s => `<div style="width:${Number(s.pct) || 0}%;background:${SEGMENT_COLORS[s.name] || 'var(--text-dim)'}" title="${esc(s.name)}: ${s.pct}%"></div>`).join('')}
      </div>
      <div style="display:flex;gap:1.5rem;font-size:0.78rem;flex-wrap:wrap">
        ${segments.map(s => `
          <div style="display:flex;align-items:center;gap:0.35rem">
            <span style="width:10px;height:10px;border-radius:3px;background:${SEGMENT_COLORS[s.name] || 'var(--text-dim)'}"></span>
            <span style="text-transform:capitalize;font-weight:500">${esc(s.name)}</span>
            <span style="color:var(--text-dim)">${s.count} (${s.pct}%)</span>
          </div>
        `).join('')}
      </div>

      <div style="margin-top:1.25rem">
        <h3 style="font-size:0.85rem">Loyalty Tiers</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-top:0.5rem">
          ${LOYALTY_TIERS.map(t => `
            <div style="background:${t.color}08;border:1px solid ${t.color}30;border-radius:var(--radius);padding:0.6rem 0.75rem">
              <div style="font-weight:700;color:${t.color};font-size:0.85rem">${esc(t.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">
                ${t.min > 0 ? '$' + formatNumber(t.min) + '+' : 'All'} · ${t.discount}% off · ${t.points}x pts
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ── All Customers List ─────────────────────────────────────

async function renderList(el) {
  if (state.customers.length === 0) {
    el.innerHTML = skeleton(6);
    try {
      const data = await api.get('/api/customers');
      if (!_container) return;
      state.customers = data.customers || [];
    } catch (err) {
      if (!_container) return;
      el.innerHTML = `<div class="empty-state">Failed to load: ${esc(err.message)}</div>`;
      return;
    }
  }

  el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Name</th><th>Email</th><th style="text-align:right">Orders</th>
        <th style="text-align:right">Spent</th><th>City</th><th>Since</th>
      </tr></thead>
      <tbody>
        ${state.customers.map(c => `
          <tr class="cust-row" data-id="${esc(c.id)}" style="cursor:pointer">
            <td style="font-weight:600">${esc(c.firstName || '')} ${esc(c.lastName || '')}</td>
            <td style="font-size:0.8rem;color:var(--text-dim)">${esc(c.email) || '\u2014'}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${Number(c.ordersCount) || 0}</td>
            <td style="text-align:right;font-family:var(--font-mono)">${formatCurrency(c.totalSpent || 0)}</td>
            <td style="font-size:0.8rem">${esc(c.city) || '\u2014'}</td>
            <td style="font-size:0.78rem;color:var(--text-dim)">${c.createdAt ? formatDate(c.createdAt) : '\u2014'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  el.querySelectorAll('.cust-row').forEach(row => {
    row.addEventListener('click', () => openCustomerDetail(row.dataset.id));
  });
}

// ── Customer Detail Modal ──────────────────────────────────

async function openCustomerDetail(id) {
  try {
    const customer = await api.get(`/api/customers/${encodeURIComponent(id)}`);
    if (!_container) return;
    const tier = getTier(customer.totalSpend);
    const name = `${esc(customer.firstName || '')} ${esc(customer.lastName || '')}`.trim() || 'Customer';

    emit('modal:open', {
      title: name,
      wide: true,
      html: `
        <div style="display:flex;gap:1rem;align-items:flex-start;margin-bottom:1.25rem">
          <div style="width:56px;height:56px;border-radius:50%;background:${tier.color}20;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:${tier.color};flex-shrink:0">
            ${esc((customer.firstName?.[0] || '?').toUpperCase())}
          </div>
          <div style="flex:1">
            <div style="font-size:0.78rem;color:var(--text-dim)">${esc(customer.email) || 'No email'}</div>
            <div style="display:flex;gap:0.75rem;margin-top:0.5rem;font-size:0.85rem">
              <div><span style="color:var(--text-dim)">Tier:</span> <span style="font-weight:700;color:${tier.color}">${esc(tier.name)}</span></div>
              <div><span style="color:var(--text-dim)">Spent:</span> <strong>${formatCurrency(customer.totalSpend || 0)}</strong></div>
              <div><span style="color:var(--text-dim)">Orders:</span> ${Number(customer.orderCount) || 0}</div>
              <div><span style="color:var(--text-dim)">Avg:</span> ${formatCurrency(customer.avgOrder || 0)}</div>
            </div>
            ${customer.daysSinceOrder !== undefined ? `<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.3rem">Last order ${Number(customer.daysSinceOrder)}d ago</div>` : ''}
          </div>
        </div>

        <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:0.5rem;padding:0.4rem 0.6rem;background:${tier.color}08;border:1px solid ${tier.color}30;border-radius:var(--radius)">
          ${esc(tier.name)} tier: ${tier.discount}% discount · ${tier.points}x loyalty points
        </div>

        ${customer.orders?.length ? `
          <h3 style="font-size:0.85rem;margin-top:1rem">Order History (${customer.orders.length})</h3>
          <table class="data-table" style="margin-top:0.5rem">
            <thead><tr>
              <th>Order</th><th>Date</th><th style="text-align:right">Total</th><th>Status</th><th>Items</th>
            </tr></thead>
            <tbody>
              ${customer.orders.slice(0, ORDER_HISTORY_LIMIT).map(o => `
                <tr>
                  <td style="font-family:var(--font-mono);font-size:0.8rem">${esc(o.name || o.id)}</td>
                  <td style="font-size:0.8rem">${formatDate(o.date)}</td>
                  <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatCurrency(o.total)}</td>
                  <td><span class="badge badge-${o.status === 'paid' ? 'paid' : o.status === 'pending' ? 'pending' : 'pending'}">${esc(o.status) || '\u2014'}</span></td>
                  <td style="font-size:0.8rem;color:var(--text-dim)">${Number(o.items) || 0} items</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state" style="padding:1rem">No orders found</div>'}
      `,
    });
  } catch (err) {
    emit('toast:show', { message: `Failed to load customer: ${esc(err.message)}`, type: 'error' });
  }
}

// ── Tab Binding ────────────────────────────────────────────

function bindTabs() {
  if (!_container) return;
  _container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (!_container) return;
      _container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.view = tab.dataset.view;
      render();
    });
  });
}
