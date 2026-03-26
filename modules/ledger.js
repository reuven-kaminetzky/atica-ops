/**
 * Ledger Module — Financial entries from Shopify orders
 * 
 * API endpoints:
 *   GET /api/ledger?days=N → ledger entries
 *
 * Subscribes: sync:complete
 */

import { on, emit } from './event-bus.js';
import { api, formatCurrency, formatDate, skeleton } from './core.js';

let state = { loaded: false, entries: [], days: 30 };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Ledger</h2>
      <div class="module-actions">
        <select id="ledger-days" class="input-search" style="width:auto">
          <option value="7">7 days</option>
          <option value="30" selected>30 days</option>
          <option value="90">90 days</option>
        </select>
      </div>
    </div>
    <div id="ledger-content">${skeleton(10)}</div>
  `;

  await loadData();
  bindEvents();
}

async function loadData() {
  try {
    const data = await api.get('/api/ledger', { days: state.days });
    state.entries = data.ledger || [];
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('ledger-content').innerHTML =
      `<div class="empty-state">Failed to load ledger: ${err.message}</div>`;
  }
}

function render() {
  const el = document.getElementById('ledger-content');
  if (!el || !state.loaded) return;

  const totalRev = state.entries.reduce((s, e) => s + (parseFloat(e.total) || 0), 0);
  const totalTax = state.entries.reduce((s, e) => s + (parseFloat(e.tax) || 0), 0);

  el.innerHTML = `
    <div class="stat-row" style="margin-bottom:1rem">
      <div class="stat-card">
        <div class="stat-label">Entries</div>
        <div class="stat-value">${state.entries.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value">${formatCurrency(totalRev)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Tax</div>
        <div class="stat-value">${formatCurrency(totalTax)}</div>
      </div>
    </div>

    ${state.entries.length === 0
      ? '<div class="empty-state">No ledger entries in this period</div>'
      : `
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Order</th><th>Customer</th>
            <th style="text-align:right">Subtotal</th>
            <th style="text-align:right">Tax</th>
            <th style="text-align:right">Total</th>
          </tr></thead>
          <tbody>
            ${state.entries.map(e => `
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
      `}
  `;
}

function bindEvents() {
  const select = document.getElementById('ledger-days');
  if (select) {
    select.addEventListener('change', (e) => {
      state.days = parseInt(e.target.value, 10);
      state.loaded = false;
      document.getElementById('ledger-content').innerHTML = skeleton(10);
      loadData();
    });
  }
}

on('sync:complete', async () => {
  if (!_container) return;
  await loadData();
});

export function destroy() {
  _container = null;
  state = { loaded: false, entries: [], days: 30 };
}
