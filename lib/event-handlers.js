/**
 * lib/event-handlers.js — Domain Event Wiring
 *
 * ALL data access through DAL. Zero raw SQL.
 * When a PO advances, payments shift. When stock depletes, signals update.
 */

const { on, Events, use, emit } = require('./events');
const { CRITICAL_STOCK_DAYS, LOW_STOCK_DAYS } = require('./constants');

let _initialized = false;

function initialize() {
  if (_initialized) return;
  _initialized = true;

  // Lazy-load DAL to avoid circular requires at boot
  const dal = {
    get products() { return require('./dal/products'); },
    get po()       { return require('./dal/purchase-orders'); },
    get payments() { return require('./dal/payments'); },
    get logistics(){ return require('./dal/logistics'); },
    get dashboard(){ return require('./dal/dashboard'); },
  };

  // ── Audit: persist every event ───────────────────────────
  use(async (envelope) => {
    try {
      await dal.dashboard.audit(
        envelope.event.split('.')[0],
        envelope.data?.id || envelope.data?.poId || envelope.data?.mpId || 'system',
        envelope.event,
        envelope.data,
        envelope.meta?.userId || null
      );
    } catch (e) {
      console.error('[audit]', e.message);
    }
  });

  // ── PO Stage Advanced → payment status shifts ────────────
  on(Events.PO_STAGE_ADVANCED, async (data) => {
    await dal.payments.advanceOnStage(data.poId, data.to);
  }, { name: 'payment-status-on-stage' });

  // ── PO Received → receiving log + inventory update ───────
  on(Events.PO_RECEIVED, async (data) => {
    const po = await dal.po.getById(data.poId);
    if (!po) return;

    // Create receiving log
    try {
      await dal.logistics.receiving.createFromPO(data.poId, null, [{
        mpId: po.mp_id, mpName: po.mp_name, qty: po.units,
      }]);
    } catch (e) {
      console.error('[event] receiving_log insert failed:', e.message);
    }

    // Add inventory
    if (po.mp_id && po.units) {
      await dal.products.addInventory(po.mp_id, po.units);

      // Recompute days of stock
      const mp = await dal.products.getInventoryData(po.mp_id);
      if (mp && mp.velocity_per_week > 0) {
        const dos = Math.round((mp.total_inventory || 0) / (mp.velocity_per_week / 7));
        const signal = dos <= CRITICAL_STOCK_DAYS ? 'hot' : dos <= LOW_STOCK_DAYS ? 'rising' : 'steady';
        await dal.products.updateSignal(po.mp_id, signal, dos);
      }
    }
  }, { name: 'inventory-on-po-received' });

  // ── PO In Transit → create shipment ──────────────────────
  on(Events.PO_STAGE_ADVANCED, async (data) => {
    if (data.to !== 'in_transit') return;
    const po = await dal.po.getById(data.poId);
    if (!po || !po.container) return;

    try {
      await dal.dashboard.createShipment({
        id: `SH-${data.poId.replace('PO-', '')}`,
        poId: data.poId,
        container: po.container,
        vessel: po.vessel,
        origin: po.country || 'China',
        etd: po.etd,
        eta: po.eta,
      });
    } catch (e) {
      console.error('[event] shipment creation failed:', e.message);
    }
  }, { name: 'shipment-on-in-transit' });

  // ── Sale Recorded → deduct stock + check levels ──────────
  on(Events.SALE_RECORDED, async (data) => {
    for (const item of (data.items || [])) {
      if (!item.mpId) continue;

      await dal.products.deductInventory(item.mpId, item.qty || 1);

      const mp = await dal.products.getInventoryData(item.mpId);
      if (mp) {
        const stock = mp.total_inventory || 0;
        if (stock === 0) {
          await dal.products.updateSignal(item.mpId, 'stockout', 0);
          await emit(Events.INVENTORY_STOCKOUT, { mpId: item.mpId, location: data.store });
        } else if (mp.velocity_per_week > 0) {
          const dos = Math.round(stock / (mp.velocity_per_week / 7));
          const signal = dos <= CRITICAL_STOCK_DAYS ? 'hot' : dos <= LOW_STOCK_DAYS ? 'rising' : 'steady';
          await dal.products.updateSignal(item.mpId, signal, dos);
          if (dos <= CRITICAL_STOCK_DAYS) {
            await emit(Events.INVENTORY_LOW, { mpId: item.mpId, location: data.store, available: stock, daysLeft: dos });
          }
        }
      }
    }
  }, { name: 'inventory-on-sale' });

  // ── Sync completed → refresh payment statuses ─────────────
  on(Events.SYNC_COMPLETED, async () => {
    await dal.payments.refreshStatuses();
  }, { name: 'payment-refresh-on-sync' });

  console.log('[events] Handlers initialized — audit, payments, inventory, shipments');
}

module.exports = { initialize };
