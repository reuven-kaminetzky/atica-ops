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
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function isRetryable(status) {
  return status === 0 || status === 429 || status === 502 || status === 503 || status === 504;
}

async function apiRequest(method, path, body = null, { silent = false, retries = MAX_RETRIES } = {}) {
  const url = path.startsWith('/') ? path : `${API_BASE}/${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
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

      // Retry on transient server errors
      if (isRetryable(res.status) && attempt < retries) {
        const wait = res.status === 429
          ? parseInt(res.headers.get('Retry-After') || '2', 10) * 1000
          : RETRY_DELAY_MS * (attempt + 1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const msg = err.error || `${res.status} ${res.statusText}`;
        if (msg.includes('404') && msg.includes('Not Found')) {
          throw new Error('Shopify API unavailable — check Settings');
        }
        if (msg.includes('not configured') || msg.includes('SHOPIFY_STORE_URL')) {
          throw new Error('Shopify not connected — check environment variables');
        }
        throw new Error(msg);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);

      // Retry on network errors
      if (err.name !== 'AbortError' && attempt < retries && !err.message.includes('Shopify')) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      if (err.name === 'AbortError') {
        err.message = 'Request timed out — try again';
      }
      console.error(`[api] ${method} ${url}:`, err.message);
      if (!silent) emit('toast:show', { message: err.message, type: 'error' });
      throw err;
    }
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
  // Silent versions — don't toast on failure (for background/non-critical loads)
  silent: {
    get: (path, params) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return apiRequest('GET', path + qs, null, { silent: true });
    },
  },
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

export function formatPercent(value, decimals = 0) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(decimals)}%`;
}

export function formatCompact(num) {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return formatCurrency(num);
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

/**
 * Render a standard error state in a container.
 * Call when an API fetch fails in a module's init().
 */
export function errorState(container, message, { retry = null } = {}) {
  const id = 'err-' + Math.random().toString(36).slice(2, 6);
  container.innerHTML = `
    <div class="empty-state">
      <div style="font-size:1.3rem;margin-bottom:0.5rem">⚠</div>
      <div style="margin-bottom:0.25rem">${message}</div>
      ${retry ? `<button id="${id}" class="btn btn-sm" style="margin-top:0.75rem">Retry</button>` : ''}
    </div>
  `;
  if (retry) {
    container.querySelector(`#${id}`)?.addEventListener('click', retry);
  }
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
