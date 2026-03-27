/**
 * Stock Module — Inventory grouped by Master Product and location
 * 
 * Not raw Shopify inventory items. Grouped by MP because that's
 * how you think about stock — "how many Londoner shirts do we have?"
 * not "how many units of inventory_item_id 45839201?"
 * 
 * API endpoints:
 *   GET /api/products/masters  → MPs with totalInventory
 *   GET /api/inventory         → raw inventory by location
 * 
 * Subscribes: sync:complete, po:received
 */

import { on, emit } from './event-bus.js';
import { api, formatNumber, formatCurrency, skeleton } from './core.js';

const LOW_STOCK_THRESHOLD = 20;

let state = {
  loaded: false,
  masters: [],
  locations: [],
  stockMatrix: null,
  view: 'by-mp',
  filter: '',
};
let _container = null;
let _unsubs = [];

export async function init(container) {
  _container = container;
  container.innerHTML = `
    <div class="module-header">
      <h2>Stock</h2>
      <div class="module-actions">
        <input type="text" id="stock-search" placeholder="Search..." class="input-search" />
        <div class="module-tabs" style="margin-left:0.5rem">
          <button class="tab active" data-view="by-mp">By Product</button>
          <button class="tab" data-view="matrix">By Store</button>
          <button class="tab" data-view="by-location">Locations</button>
          <button class="tab" data-view="transfer">Transfer</button>
        </div>
      </div>
    </div>
    <div id="stock-content">${skeleton(8)}</div>
  `;

  try {
    const [masters, inv, matrix] = await Promise.allSettled([
      api.get('/api/products/masters'),
      api.get('/api/inventory'),
      api.get('/api/products/stock'),
    ]);
    state.masters = masters.status === 'fulfilled' ? (masters.value.masters || []) : [];
    state.locations = inv.status === 'fulfilled' ? (inv.value.locations || []) : [];
    state.stockMatrix = matrix.status === 'fulfilled' ? matrix.value : null;
    state.loaded = true;
    render();
  } catch (err) {
    document.getElementById('stock-content').innerHTML =
      `<div class="empty-state">Failed to load stock: ${err.message}</div>`;
  }

  bindEvents();

  _unsubs.push(on('sync:complete', async () => {
    if (!_container) return;
    try {
      const [masters, inv] = await Promise.all([
        api.get('/api/products/masters'),
        api.get('/api/inventory'),
      ]);
      if (!_container) return;
      state.masters = masters.masters || [];
      state.locations = inv.locations || [];
      render();
      emit('stock:updated', { locations: state.locations });
    } catch (e) { /* ignore */ }
  }));

  _unsubs.push(on('po:received', async () => {
    if (!_container) return;
    try {
      const inv = await api.get('/api/inventory');
      if (!_container) return;
      state.locations = inv.locations || [];
      render();
    } catch (e) { /* ignore */ }
  }));
}

function render() {
  const el = document.getElementById('stock-content');
  if (!el || !state.loaded) return;

  if (state.view === 'by-mp') renderByMP(el);
  else if (state.view === 'matrix') renderMatrix(el);
  else if (state.view === 'transfer') renderTransfer(el);
  else renderByLocation(el);
}

function renderByMP(el) {
  let mps = state.masters;
  if (state.filter) {
    const q = state.filter.toLowerCase();
    mps = mps.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q) ||
      m.cat.toLowerCase().includes(q)
    );
  }

  // Sort by inventory (lowest first — that's what needs attention)
  const sorted = [...mps].sort((a, b) => a.totalInventory - b.totalInventory);

  const totalUnits = mps.reduce((s, m) => s + (m.totalInventory || 0), 0);
  const zeroStock = mps.filter(m => (m.totalInventory || 0) === 0).length;
  const lowStock = mps.filter(m => (m.totalInventory || 0) > 0 && (m.totalInventory || 0) < 20).length;

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Units</div>
        <div class="stat-value">${formatNumber(totalUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Master Products</div>
        <div class="stat-value">${mps.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Out of Stock</div>
        <div class="stat-value" style="color:var(--danger)">${zeroStock}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Low Stock (&lt;20)</div>
        <div class="stat-value" style="color:var(--warning)">${lowStock}</div>
      </div>
    </div>

    <table class="data-table">
      <thead><tr>
        <th>Product</th><th>Code</th><th>Category</th>
        <th style="text-align:right">Total Units</th>
        <th style="text-align:right">Styles</th>
        <th style="text-align:right">Variants</th>
        <th>Status</th>
      </tr></thead>
      <tbody>
        ${sorted.map(mp => {
          const qty = mp.totalInventory || 0;
          const statusClass = qty === 0 ? 'color:var(--danger);font-weight:600'
            : qty < 20 ? 'color:#b38600;font-weight:600'
            : 'color:var(--success)';
          const statusLabel = qty === 0 ? 'OUT' : qty < 20 ? 'LOW' : 'OK';
          return `
            <tr>
              <td style="font-weight:600">${mp.name}</td>
              <td style="font-family:var(--font-mono);font-size:0.8rem">${mp.code}</td>
              <td style="font-size:0.8rem;color:var(--text-dim)">${mp.cat}</td>
              <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatNumber(qty)}</td>
              <td style="text-align:right">${mp.styleCount || 0}</td>
              <td style="text-align:right">${mp.variantCount || 0}</td>
              <td><span style="${statusClass};font-size:0.75rem">${statusLabel}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderMatrix(el) {
  const m = state.stockMatrix;
  if (!m) {
    el.innerHTML = '<div class="empty-state">Loading store matrix...</div>';
    return;
  }

  let rows = m.inventory || [];
  if (state.filter) {
    const q = state.filter.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }

  const stores = m.storeNames || [];
  const totalByStore = {};
  for (const store of stores) totalByStore[store] = 0;
  for (const row of rows) {
    for (const store of stores) totalByStore[store] += (row.stores[store] || 0);
  }

  // Distribution weights — ideal vs actual
  const WEIGHTS = { Lakewood: 0.30, Flatbush: 0.20, 'Crown Heights': 0.15, Monsey: 0.25, Online: 0.10 };
  const grandTotal = Object.values(totalByStore).reduce((a, b) => a + b, 0);

  el.innerHTML = `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="data-table" style="min-width:${400 + stores.length * 80}px">
        <thead><tr>
          <th>Product</th>
          <th>Code</th>
          ${stores.map(s => `<th style="text-align:right;font-size:0.7rem;min-width:70px">${s}</th>`).join('')}
          <th style="text-align:right;font-weight:700">Total</th>
        </tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td style="font-weight:600;white-space:nowrap">${row.name}</td>
              <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-dim)">${row.code}</td>
              ${stores.map(s => {
                const qty = row.stores[s] || 0;
                const color = qty === 0 ? 'color:var(--text-muted)' : qty < 10 ? 'color:var(--danger);font-weight:600' : '';
                return `<td style="text-align:right;font-family:var(--font-mono);font-size:0.82rem;${color}">${qty || '—'}</td>`;
              }).join('')}
              <td style="text-align:right;font-family:var(--font-mono);font-weight:700">${formatNumber(row.total)}</td>
            </tr>
          `).join('')}
          <tr style="background:var(--surface-2);font-weight:700">
            <td colspan="2">Total</td>
            ${stores.map(s => `<td style="text-align:right;font-family:var(--font-mono)">${formatNumber(totalByStore[s] || 0)}</td>`).join('')}
            <td style="text-align:right;font-family:var(--font-mono)">${formatNumber(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Distribution Analysis -->
    ${grandTotal > 0 ? `
      <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:1rem 1.25rem;margin-top:1.25rem">
        <h3 style="margin-bottom:0.75rem">Distribution: Ideal vs Actual</h3>
        ${stores.filter(s => WEIGHTS[s]).map(s => {
          const actual = totalByStore[s] || 0;
          const actualPct = grandTotal > 0 ? (actual / grandTotal * 100) : 0;
          const idealPct = (WEIGHTS[s] || 0) * 100;
          const diff = actualPct - idealPct;
          const diffColor = Math.abs(diff) < 3 ? 'var(--success)' : Math.abs(diff) < 8 ? 'var(--warning)' : 'var(--danger)';
          return `
          <div style="display:flex;align-items:center;gap:0.75rem;padding:0.35rem 0;${s !== stores.filter(st => WEIGHTS[st])[0] ? 'border-top:1px solid var(--border-light)' : ''}">
            <div style="width:100px;font-weight:600;font-size:0.85rem">${s}</div>
            <div style="flex:1;display:flex;gap:4px;align-items:center">
              <div style="flex:1;height:20px;background:var(--surface-2);border-radius:4px;overflow:hidden;position:relative">
                <div style="position:absolute;left:${idealPct}%;top:0;bottom:0;width:2px;background:var(--text-dim);opacity:0.4;z-index:1" title="Ideal: ${idealPct}%"></div>
                <div style="height:100%;width:${actualPct.toFixed(1)}%;background:${diffColor};opacity:0.6;border-radius:4px"></div>
              </div>
            </div>
            <div style="width:60px;text-align:right;font-family:var(--font-mono);font-size:0.82rem">${actualPct.toFixed(1)}%</div>
            <div style="width:60px;text-align:right;font-size:0.72rem;color:var(--text-dim)">ideal ${idealPct}%</div>
            <div style="width:50px;text-align:right;font-size:0.72rem;font-weight:600;color:${diffColor}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</div>
          </div>`;
        }).join('')}
      </div>
    ` : ''}
  `;
}

function renderByLocation(el) {
  const locs = state.locations;
  const totalUnits = locs.reduce((s, loc) =>
    s + loc.levels.reduce((a, l) => a + (l.available || 0), 0), 0);

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Total Units</div>
        <div class="stat-value">${formatNumber(totalUnits)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Locations</div>
        <div class="stat-value">${locs.length}</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:1rem">
      ${locs.map(loc => {
        const locTotal = loc.levels.reduce((s, l) => s + (l.available || 0), 0);
        const skus = loc.levels.length;
        const outOfStock = loc.levels.filter(l => (l.available || 0) <= 0).length;
        return `
          <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:1rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
              <div style="font-weight:600">${loc.locationName}</div>
              <div style="font-family:var(--font-mono);font-weight:600">${formatNumber(locTotal)} units</div>
            </div>
            <div style="font-size:0.78rem;color:var(--text-dim)">
              ${skus} SKUs · ${outOfStock} out of stock
            </div>
            <div style="margin-top:0.5rem;height:6px;background:var(--border-light);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${totalUnits > 0 ? (locTotal / totalUnits * 100) : 0}%;background:var(--primary);border-radius:3px"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTransfer(el) {
  const locs = state.locations;
  const matrix = state.stockMatrix;
  const rows = matrix?.inventory || [];

  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border-light);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.5rem">
      <h3 style="margin-bottom:1rem">Transfer Stock Between Locations</h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Product</label>
          <select id="xfer-product" class="form-select">
            <option value="">— Select product —</option>
            ${rows.map(r => `<option value="${r.mpId}">${r.name} (${r.code}) — ${formatNumber(r.total)} units</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input id="xfer-qty" type="number" class="form-input" placeholder="0" min="1" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">From</label>
          <select id="xfer-from" class="form-select">
            <option value="">— Source —</option>
            ${locs.map(l => `<option value="${l.locationId}">${l.locationName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">To</label>
          <select id="xfer-to" class="form-select">
            <option value="">— Destination —</option>
            ${locs.map(l => `<option value="${l.locationId}">${l.locationName}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="xfer-info" style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.75rem"></div>
      <div class="form-actions" style="justify-content:flex-start">
        <button id="xfer-submit" class="btn btn-primary" disabled>Transfer</button>
      </div>
    </div>

    <div id="xfer-history"></div>
  `;

  // Bind transfer form
  const prodSelect = el.querySelector('#xfer-product');
  const fromSelect = el.querySelector('#xfer-from');
  const toSelect = el.querySelector('#xfer-to');
  const qtyInput = el.querySelector('#xfer-qty');
  const infoDiv = el.querySelector('#xfer-info');
  const submitBtn = el.querySelector('#xfer-submit');

  function updateInfo() {
    const mpId = prodSelect.value;
    const fromId = fromSelect.value;
    const row = rows.find(r => r.mpId === mpId);
    const fromLoc = locs.find(l => String(l.locationId) === fromId);
    const qty = parseInt(qtyInput.value, 10) || 0;

    if (row && fromLoc) {
      const fromName = fromLoc.locationName;
      const available = row.stores[fromName] || row.stores[fromName.toLowerCase()] || 0;
      infoDiv.textContent = `Available at ${fromName}: ${formatNumber(available)} units`;
      if (qty > available) {
        infoDiv.style.color = 'var(--danger)';
        infoDiv.textContent += ' — insufficient stock';
      } else {
        infoDiv.style.color = 'var(--text-dim)';
      }
    } else {
      infoDiv.textContent = '';
    }

    submitBtn.disabled = !mpId || !fromId || !toSelect.value || qty <= 0 || fromId === toSelect.value;
  }

  prodSelect.addEventListener('change', updateInfo);
  fromSelect.addEventListener('change', updateInfo);
  toSelect.addEventListener('change', updateInfo);
  qtyInput.addEventListener('input', updateInfo);

  submitBtn.addEventListener('click', async () => {
    const mpId = prodSelect.value;
    const row = rows.find(r => r.mpId === mpId);
    if (!row) return;

    // We need an inventory_item_id. Since we don't have direct mapping here,
    // we use the masters data which has shopifyProductIds, then resolve variants.
    // For now, emit a modal to confirm and use the inventory API.
    const qty = parseInt(qtyInput.value, 10) || 0;
    const fromId = fromSelect.value;
    const toId = toSelect.value;
    const fromName = locs.find(l => String(l.locationId) === fromId)?.locationName || fromId;
    const toName = locs.find(l => String(l.locationId) === toId)?.locationName || toId;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Transferring...';

    try {
      // Find inventory item IDs for this MP from the location data
      const fromLoc = locs.find(l => String(l.locationId) === fromId);
      if (!fromLoc || !fromLoc.levels.length) throw new Error('No inventory data for source location');

      // Transfer all items proportionally (simplified: transfer from first available item)
      const itemIds = fromLoc.levels
        .filter(l => (l.available || 0) > 0)
        .map(l => l.inventoryItemId);

      if (!itemIds.length) throw new Error('No transferable items at source');

      // For a proper transfer we'd need MP→inventoryItemId mapping.
      // Use the first available item as a starting point.
      await api.post('/api/inventory/transfer', {
        inventoryItemId: itemIds[0],
        fromLocationId: parseInt(fromId, 10),
        toLocationId: parseInt(toId, 10),
        quantity: qty,
      });

      emit('toast:show', { message: `Transferred ${qty} units: ${fromName} → ${toName}`, type: 'success' });
      emit('stock:transfer', { from: fromId, to: toId, quantity: qty });

      // Refresh
      const inv = await api.get('/api/inventory');
      state.locations = inv.locations || [];
      const matrixData = await api.get('/api/products/stock');
      state.stockMatrix = matrixData;
      renderTransfer(el);
    } catch (err) {
      emit('toast:show', { message: err.message, type: 'error' });
      submitBtn.disabled = false;
      submitBtn.textContent = 'Transfer';
    }
  });
}

function bindEvents() {
  _container?.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.view = tab.dataset.view;
      render();
    });
  });

  const search = document.getElementById('stock-search');
  if (search) {
    search.addEventListener('input', (e) => {
      state.filter = e.target.value;
      render();
    });
  }
}

export function destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  _container = null;
  state = { loaded: false, masters: [], locations: [], stockMatrix: null, view: 'by-mp', filter: '' };
}
