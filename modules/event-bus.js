/**
 * Event Bus — inter-module communication
 * 
 * RULES:
 * - Never reach into another module's DOM or state
 * - Publish events, subscribe to events
 * - Every event must be in the EVENTS registry below
 * 
 * Usage:
 *   import { on, emit, off } from './event-bus.js';
 *   on('order:new', (data) => { ... });
 *   emit('order:new', orderData);
 */

const listeners = {};

// ── Event Registry ──────────────────────────────────────────
// Document every event so all modules know what's available
export const EVENTS = {
  // Navigation
  'nav:change':          'Sidebar → all modules. Data: { route: string }',
  'nav:ready':           'Shell → all. App shell is mounted.',

  // Orders / POS (Deshawn publishes)
  'order:new':           'POS → Cash Flow, Marketplace. Data: order object',
  'order:synced':        'API → all. Data: { orders: [], count: number }',
  'sale:complete':       'POS → Cash Flow. Data: { orderId, total, store }',

  // Cash Flow / POs (Deshawn publishes)
  'po:created':          'Cash Flow → Stock. Data: PO object',
  'po:updated':          'Cash Flow → Stock. Data: PO object',
  'po:received':         'Cash Flow → Stock, Marketplace. Data: { po, items }',

  // Products / Stock (Shrek publishes)
  'product:updated':     'Marketplace → Cash Flow. Data: product object',
  'product:costUpdated': 'Marketplace → Cash Flow. Data: { productId, cost }',
  'stock:updated':       'Stock → POS, Marketplace. Data: { location, levels }',
  'stock:low':           'Stock → Marketplace, Cash Flow. Data: { product, threshold }',
  'stock:transfer':      'Stock → all. Data: { from, to, items }',

  // Data sync
  'sync:start':          'Any → all. Data: { source: string }',
  'sync:complete':       'Any → all. Data: { source, count }',
  'sync:error':          'Any → all. Data: { source, error }',

  // UI
  'toast:show':          'Any → shell. Data: { message, type: "info"|"success"|"error" }',
  'modal:open':          'Any → shell. Data: { title, html, onMount?, onClose?, wide? }',
  'modal:close':         'Any → shell. Data: null',
};

// ── Core API ────────────────────────────────────────────────

export function on(event, fn) {
  if (!EVENTS[event]) console.warn(`[event-bus] Unknown event: ${event}`);
  (listeners[event] ||= []).push(fn);
  return () => off(event, fn); // return unsubscribe function
}

export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== fn);
}

export function emit(event, data) {
  if (!EVENTS[event]) console.warn(`[event-bus] Unknown event: ${event}`);
  const fns = listeners[event] || [];
  for (const fn of fns) {
    try {
      fn(data);
    } catch (err) {
      console.error(`[event-bus] Error in ${event} handler:`, err);
    }
  }
}

// ── Debug helper ────────────────────────────────────────────
export function debug() {
  const active = {};
  for (const [event, fns] of Object.entries(listeners)) {
    if (fns.length > 0) active[event] = fns.length;
  }
  console.table(active);
  return active;
}
