/**
 * Home Module — Navigation tiles + quick status
 * No KPIs. No vanity metrics. Functional summary + navigation.
 */

import { emit } from './event-bus.js';
import { api, formatCurrency, formatNumber } from './core.js';

const TILES = [
  { id: 'marketplace', label: 'Master Products', desc: 'Products, styles, fits, Shopify catalog',    icon: '▤', color: '#1d3557' },
  { id: 'cash-flow',   label: 'Cash Flow',        desc: 'Revenue, POs, production planning',         icon: '◫', color: '#2d6a4f' },
  { id: 'stock',       label: 'Stock',             desc: 'Inventory by product and location',         icon: '▦', color: '#6c584c' },
  { id: 'vendors',     label: 'Vendors',           desc: 'Vendor management, PO rollup',              icon: '⊞', color: '#714b67' },
  { id: 'analytics',   label: 'Analytics',         desc: 'Revenue charts, velocity, demand signals',  icon: '◩', color: '#264653' },
  { id: 'settings',    label: 'Settings',          desc: 'Shopify connection, sync, cache',            icon: '⚙', color: '#495057' },
];

export async function init(container) {
  container.innerHTML = `
    <div style="max-width:800px;margin:2rem auto;padding:0 1rem">
      <div style="margin-bottom:2rem">
        <div style="font-size:1.6rem;font-weight:700;letter-spacing:-.5px">Atica Man</div>
        <div style="font-size:0.85rem;color:var(--text-dim);margin-top:0.25rem">Operations Platform</div>
      </div>
      <div id="home-summary" style="margin-bottom:1.5rem"></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.75rem">
        ${TILES.map(t => `
          <button class="home-tile" data-route="${t.id}" style="
            display:flex;flex-direction:column;align-items:flex-start;
            padding:1.25rem;border-radius:var(--radius-lg);
            border:1px solid var(--border-light);background:var(--surface);
            cursor:pointer;text-align:left;transition:all .15s;
            min-height:120px;position:relative;overflow:hidden;
          ">
            <div style="font-size:1.5rem;margin-bottom:0.5rem;opacity:0.85">${t.icon}</div>
            <div style="font-size:0.92rem;font-weight:600;margin-bottom:0.2rem">${t.label}</div>
            <div style="font-size:0.75rem;color:var(--text-dim);line-height:1.4">${t.desc}</div>
            <div style="position:absolute;top:0;right:0;width:3px;height:100%;background:${t.color}"></div>
          </button>
        `).join('')}
      </div>
    </div>
    <style>
      .home-tile:hover { box-shadow:0 4px 16px rgba(0,0,0,.08); transform:translateY(-1px); }
      .home-tile:active { transform:translateY(0); }
    </style>
  `;

  container.querySelectorAll('.home-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      emit('nav:change', { route: btn.dataset.route });
    });
  });

  // Load quick summary (non-blocking)
  loadSummary();
}

async function loadSummary() {
  const el = document.getElementById('home-summary');
  if (!el) return;

  try {
    const [status, health] = await Promise.all([
      api.get('/api/status').catch(() => null),
      api.get('/api/workflow/health').catch(() => null),
    ]);

    let html = '';

    // Connection status
    if (status?.connected) {
      html += `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;font-size:0.78rem;margin-bottom:0.75rem">
        <span style="padding:0.3rem 0.65rem;background:var(--success-bg);border:1px solid var(--success);border-radius:20px;color:var(--success)">● Connected to ${status.shop}</span>
        <span style="padding:0.3rem 0.65rem;background:var(--surface-2);border:1px solid var(--border-light);border-radius:20px;color:var(--text-dim)">${status.plan} · ${status.currency} · API ${status.apiVersion}</span>
      </div>`;
    } else {
      html += `<div style="padding:0.75rem;background:var(--danger-bg);border:1px solid var(--danger);border-radius:var(--radius);font-size:0.85rem;color:var(--danger);margin-bottom:0.75rem">
        Shopify not connected — check Settings
      </div>`;
    }

    // System health
    if (health) {
      html += `<div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.6rem">
        <div class="stat-card" style="padding:0.75rem 1rem">
          <div class="stat-label">Products</div>
          <div class="stat-value" style="font-size:1.15rem">${health.totalMPs}</div>
        </div>
        <div class="stat-card" style="padding:0.75rem 1rem">
          <div class="stat-label">Active POs</div>
          <div class="stat-value" style="font-size:1.15rem">${health.activePOs}</div>
          ${health.overduePOs > 0 ? `<div style="font-size:0.72rem;color:var(--danger);margin-top:0.15rem">${health.overduePOs} overdue</div>` : ''}
        </div>
        <div class="stat-card" style="padding:0.75rem 1rem">
          <div class="stat-label">Committed</div>
          <div class="stat-value" style="font-size:1.15rem">${formatCurrency(health.totalCommittedCost)}</div>
        </div>
        <div class="stat-card" style="padding:0.75rem 1rem">
          <div class="stat-label">PLM Tracked</div>
          <div class="stat-value" style="font-size:1.15rem">${health.mpsWithPLMData}</div>
        </div>
      </div>`;
    }

    el.innerHTML = html;
  } catch (e) { /* silent */ }
}

export function destroy() {}
