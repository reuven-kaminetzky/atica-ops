/**
 * lib/domain/events.js — Domain Event Bus
 *
 * The nervous system. Every significant action emits an event.
 * Subscribers react independently. Adding behavior = adding a subscriber.
 *
 * Usage:
 *   const { emit, on, Events } = require('./events');
 *   on(Events.PO_CREATED, async (data) => { ... });
 *   await emit(Events.PO_CREATED, { id: 'PO-001', ... });
 *
 * Rules:
 *   1. Events are past-tense facts: "po.created", not "create.po"
 *   2. Handlers must not throw — they log errors and continue
 *   3. Handlers run in parallel (Promise.allSettled)
 *   4. Events are persisted to audit_log for replay
 */

// ── Event Definitions ────────────────────────────────────

const Events = {
  // Product
  MP_CREATED:         'mp.created',
  MP_PHASE_CHANGED:   'mp.phase_changed',
  MP_DISCONTINUED:    'mp.discontinued',
  STACK_UPDATED:      'stack.updated',
  STACK_COMPLETED:    'stack.completed',

  // Purchase Orders
  PO_CREATED:         'po.created',
  PO_STAGE_ADVANCED:  'po.stage_advanced',
  PO_RECEIVED:        'po.received',
  PO_CANCELLED:       'po.cancelled',

  // Payments
  PAYMENT_SCHEDULED:  'po.payment_scheduled',
  PAYMENT_DUE:        'po.payment_due',
  PAYMENT_OVERDUE:    'po.payment_overdue',
  PAYMENT_PAID:       'po.payment_paid',

  // Inventory
  INVENTORY_SYNCED:   'inventory.synced',
  INVENTORY_ADJUSTED: 'inventory.adjusted',
  INVENTORY_TRANSFERRED: 'inventory.transferred',
  INVENTORY_LOW:      'inventory.low_stock',
  INVENTORY_STOCKOUT: 'inventory.stockout',
  INVENTORY_RECEIVED: 'inventory.received',
  INVENTORY_RFID_SCANNED: 'inventory.rfid_scanned',

  // Sales
  SALE_RECORDED:      'sale.recorded',
  SALE_REFUNDED:      'sale.refunded',
  POS_TRANSACTION:    'pos.transaction',

  // Shipments
  SHIPMENT_CREATED:   'shipment.created',
  SHIPMENT_DEPARTED:  'shipment.departed',
  SHIPMENT_ARRIVED:   'shipment.arrived',
  SHIPMENT_CLEARED:   'shipment.customs_cleared',
  SHIPMENT_DELIVERED: 'shipment.delivered',

  // Marketing
  CAMPAIGN_LAUNCHED:  'campaign.launched',
  CAMPAIGN_PAUSED:    'campaign.paused',
  CAMPAIGN_COMPLETED: 'campaign.completed',
  AD_SPEND_RECORDED:  'ad.spend_recorded',
  ATTRIBUTION_MATCHED:'attribution.matched',

  // Customers
  CUSTOMER_CREATED:   'customer.created',
  CUSTOMER_TIER_CHANGED: 'customer.tier_changed',
  CUSTOMER_LTV_UPDATED:  'customer.ltv_updated',

  // System
  SYNC_STARTED:       'sync.started',
  SYNC_COMPLETED:     'sync.completed',
  SYNC_FAILED:        'sync.failed',
};

// ── Subscriber Registry ──────────────────────────────────

const _subscribers = {};
const _middleware = [];

/**
 * Subscribe to a domain event.
 * @param {string} event — Event name from Events enum
 * @param {Function} handler — async (data, meta) => void
 * @param {object} opts — { name: 'subscriber-name' } for logging
 * @returns {Function} unsubscribe
 */
function on(event, handler, opts = {}) {
  if (!Events[Object.keys(Events).find(k => Events[k] === event)] && !event.includes('.')) {
    console.warn(`[events] Unknown event: ${event}`);
  }
  const entry = { handler, name: opts.name || handler.name || 'anonymous' };
  (_subscribers[event] ||= []).push(entry);
  return () => {
    _subscribers[event] = _subscribers[event].filter(e => e !== entry);
  };
}

/**
 * Add middleware that runs on EVERY event (for logging, persistence, etc.)
 */
function use(fn) {
  _middleware.push(fn);
}

/**
 * Emit a domain event. All subscribers run in parallel.
 * Failures are logged, never thrown — the system continues.
 *
 * @param {string} event — Event name
 * @param {object} data — Event payload
 * @param {object} meta — { userId, source, timestamp }
 * @returns {object} { event, subscriberCount, results }
 */
async function emit(event, data = {}, meta = {}) {
  const envelope = {
    event,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      source: meta.source || 'system',
      userId: meta.userId || null,
      ...meta,
    },
  };

  // Run middleware (logging, persistence)
  for (const mw of _middleware) {
    try { await mw(envelope); } catch (e) {
      console.error(`[events] Middleware error:`, e.message);
    }
  }

  // Run subscribers in parallel
  const handlers = _subscribers[event] || [];
  if (handlers.length === 0) return { event, subscriberCount: 0, results: [] };

  const results = await Promise.allSettled(
    handlers.map(async ({ handler, name }) => {
      try {
        await handler(data, envelope.meta);
        return { subscriber: name, ok: true };
      } catch (err) {
        console.error(`[events] ${event} → ${name} failed:`, err.message);
        return { subscriber: name, ok: false, error: err.message };
      }
    })
  );

  return {
    event,
    subscriberCount: handlers.length,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message }),
  };
}

/**
 * List all registered subscribers (for debugging / health checks).
 */
function listSubscribers() {
  const result = {};
  for (const [event, handlers] of Object.entries(_subscribers)) {
    if (handlers.length > 0) {
      result[event] = handlers.map(h => h.name);
    }
  }
  return result;
}

/**
 * Clear all subscribers (for testing).
 */
function clearAll() {
  for (const key of Object.keys(_subscribers)) delete _subscribers[key];
  _middleware.length = 0;
}

module.exports = { Events, on, emit, use, listSubscribers, clearAll };

// Auto-register domain event handlers on first load
try { require('./event-handlers').initialize(); } catch (e) { /* ok if handlers fail to load */ }
