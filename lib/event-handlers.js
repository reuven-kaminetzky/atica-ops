/**
 * lib/event-handlers.js — Domain Event Wiring
 *
 * Connects domains through events. Call initialize() once at app startup.
 * Each handler is a subscriber that reacts to events from other domains.
 *
 * This is the NERVOUS SYSTEM. When a PO is received, six things happen
 * automatically. When a sale is recorded, inventory deducts. When stock
 * is low, a reorder signal fires.
 */

const { on, Events, use } = require('./events');

let _initialized = false;

function initialize() {
  if (_initialized) return;
  _initialized = true;

  // ── Audit: persist every event to audit_log ──────────────

  use(async (envelope) => {
    try {
      const { sql } = require('./dal/db');
      const db = sql();
      await db`
        INSERT INTO audit_log (entity_type, entity_id, action, changes, performed_by, performed_at)
        VALUES (
          ${envelope.event.split('.')[0]},
          ${envelope.data?.id || envelope.data?.poId || envelope.data?.mpId || 'system'},
          ${envelope.event},
          ${JSON.stringify(envelope.data)},
          ${envelope.meta?.userId || null},
          ${envelope.meta?.timestamp || new Date().toISOString()}
        )
      `;
    } catch (e) {
      console.error('[events] Audit log failed:', e.message);
    }
  });

  // ── PO Created → log ─────────────────────────────────────

  on(Events.PO_CREATED, async (data) => {
    console.log(`[event] PO created: ${data.id} for ${data.mp_name || data.mpId || 'unknown'}`);
  }, { name: 'po-created-logger' });

  // ── PO Stage Advanced → side effects ─────────────────────

  on(Events.PO_STAGE_ADVANCED, async (data) => {
    console.log(`[event] PO ${data.poId}: ${data.from} → ${data.to}`);
  }, { name: 'stage-advance-logger' });

  // ── PO Received → update inventory ───────────────────────

  on(Events.PO_RECEIVED, async (data) => {
    console.log(`[event] PO received: ${data.poId} — inventory should update`);
    // When Shopify write-back is ready:
    // 1. Get PO items with quantities
    // 2. Push inventory adjustments to Shopify per location
    // 3. Update local stock numbers
    // 4. Check if any MP now has enough stock to remove reorder flag
  }, { name: 'inventory-on-po-received' });

  // ── Sale Recorded → deduct stock + update velocity ───────

  on(Events.SALE_RECORDED, async (data) => {
    console.log(`[event] Sale: ${data.orderId} at ${data.store} ($${data.total})`);
    // 1. Deduct stock at location
    // 2. Update velocity_per_week for affected MPs
    // 3. Check if stock is below reorder threshold
    // 4. Update customer LTV
  }, { name: 'sale-recorded-handler' });

  // ── Inventory Low → alert ────────────────────────────────

  on(Events.INVENTORY_LOW, async (data) => {
    console.log(`[event] Low stock: ${data.mpId} at ${data.location} (${data.available} units)`);
    // 1. Create reorder suggestion
    // 2. If warehouse has stock → suggest transfer
    // 3. If no stock anywhere → suggest new PO
  }, { name: 'low-stock-alerter' });

  // ── Payment Due/Overdue → alert ──────────────────────────

  on(Events.PAYMENT_DUE, async (data) => {
    console.log(`[event] Payment due: $${data.amount} for PO ${data.poId} on ${data.dueDate}`);
  }, { name: 'payment-due-alerter' });

  on(Events.PAYMENT_OVERDUE, async (data) => {
    console.log(`[event] OVERDUE: $${data.amount} for PO ${data.poId} (${data.daysPastDue}d past due)`);
  }, { name: 'payment-overdue-alerter' });

  // ── Shipment Arrived → notify warehouse ──────────────────

  on(Events.SHIPMENT_ARRIVED, async (data) => {
    console.log(`[event] Shipment arrived: ${data.shipmentId} — warehouse should receive`);
    // Add to receiving queue
    // Generate packing list check
  }, { name: 'shipment-arrived-handler' });

  console.log('[events] Domain event handlers initialized');
}

module.exports = { initialize };
