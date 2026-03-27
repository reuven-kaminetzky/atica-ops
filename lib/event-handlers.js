/**
 * lib/event-handlers.js — Domain Event Wiring
 *
 * Real handlers. Not stubs. When a PO is received, inventory updates.
 * When stock is low, the product gets flagged. When a stage advances,
 * payments shift status.
 */

const { on, Events, use } = require('./events');
const { CRITICAL_STOCK_DAYS, LOW_STOCK_DAYS } = require('./constants');

let _initialized = false;

function initialize() {
  if (_initialized) return;
  _initialized = true;

  const db = () => require('./dal/db').sql();

  // ── Audit: persist every event ───────────────────────────

  use(async (envelope) => {
    try {
      const sql = db();
      await sql`
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
      console.error('[audit]', e.message);
    }
  });

  // ── PO Stage Advanced → payment status shifts ────────────

  on(Events.PO_STAGE_ADVANCED, async (data) => {
    const sql = db();

    // When PO is ordered → deposit becomes due
    if (data.to === 'ordered') {
      await sql`
        UPDATE po_payments SET status = 'upcoming',
          due_date = COALESCE(due_date, NOW() + INTERVAL '7 days')
        WHERE po_id = ${data.poId} AND type = 'deposit' AND status = 'planned'
      `;
    }

    // When PO ships → production payment becomes due
    if (data.to === 'shipped') {
      await sql`
        UPDATE po_payments SET status = 'upcoming',
          due_date = COALESCE(due_date, NOW() + INTERVAL '7 days')
        WHERE po_id = ${data.poId} AND type = 'production' AND status = 'planned'
      `;
    }

    // When PO is received → balance becomes due
    if (data.to === 'received') {
      await sql`
        UPDATE po_payments SET status = 'due',
          due_date = COALESCE(due_date, NOW() + INTERVAL '14 days')
        WHERE po_id = ${data.poId} AND type = 'balance' AND status IN ('planned', 'upcoming')
      `;
    }
  }, { name: 'payment-status-on-stage' });

  // ── PO Received → create receiving log + update inventory ─

  on(Events.PO_RECEIVED, async (data) => {
    const sql = db();

    // Get the PO to know what was ordered
    const [po] = await sql`SELECT * FROM purchase_orders WHERE id = ${data.poId}`;
    if (!po) return;

    // Create receiving log entry
    try {
      const id = `RCV-${Date.now().toString(36).toUpperCase()}`;
      await sql`
        INSERT INTO receiving_log (id, po_id, expected_items, status)
        VALUES (${id}, ${data.poId}, ${JSON.stringify([{
          mpId: po.mp_id, mpName: po.mp_name, qty: po.units,
        }])}, 'pending')
        ON CONFLICT DO NOTHING
      `;
    } catch (e) {
      // Table might not exist yet (migration not run)
      console.error('[event] receiving_log insert failed:', e.message);
    }

    // Update inventory on the product
    if (po.mp_id && po.units) {
      await sql`
        UPDATE master_products
        SET total_inventory = COALESCE(total_inventory, 0) + ${po.units}
        WHERE id = ${po.mp_id}
      `;

      // Recompute days of stock
      const [mp] = await sql`SELECT velocity_per_week, total_inventory FROM master_products WHERE id = ${po.mp_id}`;
      if (mp && mp.velocity_per_week > 0) {
        const dos = Math.round((mp.total_inventory || 0) / (mp.velocity_per_week / 7));
        const signal = dos <= CRITICAL_STOCK_DAYS ? 'hot' : dos <= LOW_STOCK_DAYS ? 'rising' : 'steady';
        await sql`UPDATE master_products SET days_of_stock = ${dos}, signal = ${signal} WHERE id = ${po.mp_id}`;
      }
    }
  }, { name: 'inventory-on-po-received' });

  // ── PO In Transit → create shipment ──────────────────────

  on(Events.PO_STAGE_ADVANCED, async (data) => {
    if (data.to !== 'in_transit') return;
    const sql = db();

    const [po] = await sql`SELECT * FROM purchase_orders WHERE id = ${data.poId}`;
    if (!po || !po.container) return;

    const shipId = `SH-${data.poId.replace('PO-', '')}`;
    try {
      await sql`
        INSERT INTO shipments (id, po_id, container, vessel, origin, etd, eta, status)
        VALUES (${shipId}, ${data.poId}, ${po.container}, ${po.vessel},
          ${po.country || 'China'}, ${po.etd}, ${po.eta}, 'in_transit')
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (e) {
      console.error('[event] shipment creation failed:', e.message);
    }
  }, { name: 'shipment-on-in-transit' });

  // ── Sale Recorded → deduct stock + check levels ──────────

  on(Events.SALE_RECORDED, async (data) => {
    const sql = db();

    for (const item of (data.items || [])) {
      if (!item.mpId) continue;

      // Deduct
      await sql`
        UPDATE master_products
        SET total_inventory = GREATEST(COALESCE(total_inventory, 0) - ${item.qty || 1}, 0)
        WHERE id = ${item.mpId}
      `;

      // Check stock level
      const [mp] = await sql`SELECT total_inventory, velocity_per_week, days_of_stock FROM master_products WHERE id = ${item.mpId}`;
      if (mp) {
        const stock = mp.total_inventory || 0;
        if (stock === 0) {
          await sql`UPDATE master_products SET signal = 'stockout', days_of_stock = 0 WHERE id = ${item.mpId}`;
          const { emit } = require('./events');
          await emit(Events.INVENTORY_STOCKOUT, { mpId: item.mpId, location: data.store });
        } else if (mp.velocity_per_week > 0) {
          const dos = Math.round(stock / (mp.velocity_per_week / 7));
          if (dos <= CRITICAL_STOCK_DAYS) {
            const { emit } = require('./events');
            await emit(Events.INVENTORY_LOW, { mpId: item.mpId, location: data.store, available: stock, daysLeft: dos });
          }
          const signal = dos <= CRITICAL_STOCK_DAYS ? 'hot' : dos <= LOW_STOCK_DAYS ? 'rising' : 'steady';
          await sql`UPDATE master_products SET days_of_stock = ${dos}, signal = ${signal} WHERE id = ${item.mpId}`;
        }
      }
    }
  }, { name: 'inventory-on-sale' });

  // ── Payment refresh (called periodically) ────────────────

  on(Events.SYNC_COMPLETED, async () => {
    const sql = db();
    const today = new Date().toISOString().split('T')[0];

    // Mark overdue
    await sql`
      UPDATE po_payments SET status = 'overdue'
      WHERE due_date < ${today} AND status IN ('planned', 'upcoming', 'due')
    `;

    // Mark due (within 7 days)
    await sql`
      UPDATE po_payments SET status = 'due'
      WHERE due_date BETWEEN ${today} AND (${today}::date + 7)
        AND status IN ('planned', 'upcoming')
    `;
  }, { name: 'payment-refresh-on-sync' });

  console.log('[events] Handlers initialized — audit, payments, inventory, shipments');
}

module.exports = { initialize };
