/**
 * Sidebar Component — Odoo-style navigation
 * Shared — everyone reads, nobody edits without consensus
 * 
 * Renders the sidebar and handles route changes.
 * Emits nav:change when user clicks a nav item.
 */

import { emit, on } from '../modules/event-bus.js';

const NAV_ITEMS = [
  // Dashboard
  { section: 'Dashboard', items: [
    { id: 'home',        label: 'Overview',        icon: '◉' },
  ]},
  // Trunk
  { section: 'Operations', items: [
    { id: 'pos',         label: 'Point of Sale',  icon: '◎' },
    { id: 'cash-flow',   label: 'Cash Flow',      icon: '◫' },
  ]},
  // Branches
  { section: 'Catalog', items: [
    { id: 'marketplace', label: 'Marketplace',     icon: '▤' },
    { id: 'stock',       label: 'Stock',           icon: '▦' },
  ]},
  // Leaves
  { section: 'Finance', items: [
    { id: 'ledger',      label: 'Ledger',          icon: '◈' },
  ]},
  // System
  { section: 'System', items: [
    { id: 'settings',    label: 'Settings',        icon: '⚙' },
  ]},
];

let currentRoute = 'home';

export function renderSidebar(container) {
  container.innerHTML = `
    <div class="sidebar-logo">
      A <span>Atica Man</span>
    </div>
    ${NAV_ITEMS.map(section => `
      <div class="sidebar-section">
        <div class="sidebar-section-label">${section.section}</div>
        ${section.items.map(item => `
          <button class="sidebar-item ${item.id === currentRoute ? 'active' : ''}" data-route="${item.id}">
            <span class="icon">${item.icon}</span>
            ${item.label}
          </button>
        `).join('')}
      </div>
    `).join('')}
    <div class="sidebar-footer">
      Atica Ops v2.0 — Modular
    </div>
  `;

  // Bind clicks
  container.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      if (route === currentRoute) return;
      currentRoute = route;

      // Update active state
      container.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      emit('nav:change', { route });
    });
  });
}

export function getCurrentRoute() {
  return currentRoute;
}

export function setRoute(route) {
  currentRoute = route;
}
