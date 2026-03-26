/**
 * Core — API client, module loader, shared utilities
 * 
 * This is the backbone. Every module imports from here.
 * Nobody should be doing raw fetch() calls to the API.
 * 
 * Usage:
 *   import { api, loadModule, formatCurrency, formatDate } from './core.js';
 *   const products = await api.get('/api/products');
 */

import { emit } from './event-bus.js';

// ── API Client ──────────────────────────────────────────────

const API_BASE = '/api';
const API_TIMEOUT_MS = 15000;

async function apiRequest(method, path, body = null) {
  const url = path.startsWith('/') ? path : `${API_BASE}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    clearTimeout(timer);

    if (res.status === 304) return { _cached: true, _notModified: true };
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const msg = err.error || `${res.status} ${res.statusText}`;
      // Better Shopify error messages
      if (msg.includes('404') && msg.includes('Not Found')) {
        throw new Error('Shopify API unavailable — check API version and store URL in Settings');
      }
      if (msg.includes('not configured') || msg.includes('SHOPIFY_STORE_URL')) {
        throw new Error('Shopify not connected — check environment variables');
      }
      throw new Error(msg);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      err.message = 'Request timed out — try again';
    }
    console.error(`[api] ${method} ${url}:`, err.message);
    emit('toast:show', { message: err.message, type: 'error' });
    throw err;
  }
}

export const api = {
  get:   (path, params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiRequest('GET', path + qs);
  },
  post:  (path, body) => apiRequest('POST', path, body),
  patch: (path, body) => apiRequest('PATCH', path, body),
  del:   (path) => apiRequest('DELETE', path),
};

// ── Module Loader ───────────────────────────────────────────

const loadedModules = {};
let _activeModule = null;

/**
 * Load and initialize a module into a container element.
 * Each module must export an `init(container)` function.
 * Optionally exports `destroy()` for cleanup.
 */
export async function loadModule(name, container) {
  // Destroy CURRENTLY ACTIVE module, not the one being loaded
  if (_activeModule && loadedModules[_activeModule]?.destroy) {
    try {
      loadedModules[_activeModule].destroy();
    } catch (err) {
      console.warn(`[core] destroy() failed for "${_activeModule}":`, err);
    }
  }

  _activeModule = name;

  try {
    const mod = await import(`./${name}.js`);
    if (typeof mod.init !== 'function') {
      throw new Error(`Module "${name}" missing init() export`);
    }
    await mod.init(container);
    loadedModules[name] = mod;
    return mod;
  } catch (err) {
    console.error(`[core] Failed to load module "${name}":`, err);
    container.innerHTML = `
      <div style="padding:2rem;text-align:center;color:var(--danger,#f87171);">
        <div style="font-size:1.5rem;margin-bottom:0.5rem">⚠</div>
        <h3 style="margin-bottom:0.5rem">Failed to load ${name}</h3>
        <p style="font-size:0.85rem;color:var(--text-dim,#888)">${err.message}</p>
        <button onclick="location.reload()" style="margin-top:1rem;padding:0.4rem 1rem;
          border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:none">
          Reload
        </button>
      </div>
    `;
    // Don't throw — the error is displayed, the app can still navigate
  }
}

// ── Formatters ──────────────────────────────────────────────

export function formatCurrency(amount, currency = 'USD') {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);
}

export function formatDate(dateStr, opts = {}) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  });
}

export function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

export function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── DOM Helpers ─────────────────────────────────────────────

export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

export function html(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const val = values[i] !== undefined ? values[i] : '';
    return result + str + (Array.isArray(val) ? val.join('') : val);
  }, '');
}

// ── Loading skeleton ────────────────────────────────────────

export function skeleton(rows = 5) {
  return `
    <div class="skeleton-container">
      ${Array(rows).fill(0).map(() => `
        <div class="skeleton-row">
          <div class="skeleton-bar" style="width:${30 + Math.random() * 50}%"></div>
        </div>
      `).join('')}
    </div>
  `;
}
