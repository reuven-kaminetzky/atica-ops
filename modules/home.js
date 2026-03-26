/**
 * Home Module — Navigation tiles, Odoo style
 * No KPIs. No vanity metrics. Just get to work.
 */

import { emit } from './event-bus.js';

const TILES = [
  { id: 'marketplace', label: 'Master Products', desc: 'Products, styles, fits, Shopify catalog',          icon: '▤', color: '#1d3557' },
  { id: 'cash-flow',   label: 'Cash Flow',        desc: 'Revenue, POs, production planning',               icon: '◫', color: '#2d6a4f' },
  { id: 'stock',       label: 'Stock',             desc: 'Inventory by product and location',               icon: '▦', color: '#6c584c' },
  { id: 'vendors',     label: 'Vendors',           desc: 'Vendor management, PO rollup',                    icon: '⊞', color: '#714b67' },
  { id: 'ledger',      label: 'Ledger',            desc: 'Financial entries from orders',                   icon: '◈', color: '#3a0ca3' },
  { id: 'settings',    label: 'Settings',          desc: 'Shopify connection, sync, cache',                 icon: '⚙', color: '#495057' },
];

export async function init(container) {
  container.innerHTML = `
    <div style="max-width:720px;margin:3rem auto;padding:0 1rem">
      <div style="margin-bottom:2.5rem">
        <div style="font-size:1.8rem;font-weight:700;letter-spacing:-.5px">Atica Man</div>
        <div style="font-size:0.85rem;color:var(--text-dim);margin-top:0.25rem">Operations Platform</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem">
        ${TILES.map(t => `
          <button class="home-tile" data-route="${t.id}" style="
            display:flex;flex-direction:column;align-items:flex-start;
            padding:1.5rem;border-radius:var(--radius-lg);
            border:1px solid var(--border-light);background:var(--surface);
            cursor:pointer;text-align:left;transition:all .15s;
            min-height:140px;position:relative;overflow:hidden;
          ">
            <div style="font-size:2rem;margin-bottom:0.75rem;opacity:0.85">${t.icon}</div>
            <div style="font-size:1rem;font-weight:600;margin-bottom:0.3rem">${t.label}</div>
            <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.4">${t.desc}</div>
            <div style="position:absolute;top:0;right:0;width:4px;height:100%;background:${t.color}"></div>
          </button>
        `).join('')}
      </div>
    </div>
    <style>
      .home-tile:hover { box-shadow:0 4px 16px rgba(0,0,0,.08); transform:translateY(-2px); }
      .home-tile:active { transform:translateY(0); }
    </style>
  `;

  container.querySelectorAll('.home-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      emit('nav:change', { route: btn.dataset.route });
    });
  });
}

export function destroy() {}
