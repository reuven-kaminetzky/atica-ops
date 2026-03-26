/**
 * lib/effects.js — Side Effects Engine
 * 
 * Executes domain events when state machines transition.
 * This is the glue that makes MPs, POs, cash flow, and inventory
 * actually TALK to each other.
 * 
 * DESIGN:
 * - Pure functions: effect(context) → { actions[], logs[] }
 * - No direct store writes — returns actions for the caller to execute
 * - Caller (the Netlify function handler) decides whether to commit
 * - Every effect is logged for audit trail
 * 
 * USAGE in purchase-orders.js:
 *   const effects = require('../../lib/effects');
 *   const result = effects.onPOStageAdvanced(po, fromStage, toStage, { store });
 *   // result.actions = [{ type: 'shipment:create', data: {...} }, ...]
 *   // result.logs = [{ event: 'po:shipped', ...}]
 *   for (const action of result.actions) await executeAction(action, store);
 */

const { PO_LIFECYCLE, MP_LIFECYCLE, PAYMENT_TYPES, DOMAIN_EVENTS } = require('./index');
const { suggestDistribution, landedCost } = require('./products');

// ═══════════════════════════════════════════════════════════
// PO Stage Side Effects
// ═══════════════════════════════════════════════════════════

/**
 * Compute side effects when a PO advances to a new stage.
 * Returns { actions: [], logs: [] } — caller executes the actions.
 */
function onPOStageAdvanced(po, fromStage, toStage) {
  const actions = [];
  const logs = [];
  const now = new Date().toISOString();

  // Find stage definition
  const stageDef = PO_LIFECYCLE.find(s => s.name === toStage);
  if (!stageDef || !stageDef.sideEffects) return { actions, logs };

  for (const effect of stageDef.sideEffects) {
    switch (effect) {
      case 'mp:advance-to-po-created':
        if (po.mpId) {
          actions.push({
            type: 'plm:advance',
            target: po.mpId,
            data: { phase: 'PO Created', reason: `PO ${po.id} ordered` },
          });
          logs.push({ event: 'po:ordered', poId: po.id, mpId: po.mpId, at: now });
        }
        break;

      case 'shipment:auto-create':
        actions.push({
          type: 'shipment:create',
          data: {
            id: 'SHIP-' + Date.now().toString(36).toUpperCase(),
            poId: po.id,
            mpId: po.mpId || null,
            mpName: po.mpName || null,
            vendor: po.vendor || null,
            container: po.container || null,
            vessel: po.vessel || null,
            etd: po.etd || null,
            eta: po.eta || null,
            units: po.units || 0,
            fobTotal: po.fobTotal || 0,
            status: 'in-transit',
            createdAt: now,
            events: [{ type: 'created', date: now, note: `Auto from PO ${po.id}` }],
          },
        });
        logs.push({ event: 'po:shipped', poId: po.id, at: now });
        break;

      case 'inventory:update':
        if (po.mpId && po.units) {
          actions.push({
            type: 'inventory:record-receipt',
            data: { mpId: po.mpId, poId: po.id, units: po.units, receivedAt: now },
          });
          logs.push({ event: 'inventory:received', poId: po.id, mpId: po.mpId, units: po.units, at: now });
        }
        break;

      case 'distribution:suggest':
        if (po.units > 0) {
          const distribution = suggestDistribution(po.units);
          actions.push({
            type: 'distribution:suggest',
            data: { poId: po.id, mpId: po.mpId, totalUnits: po.units, suggestion: distribution },
          });
          logs.push({ event: 'distribution:suggested', poId: po.id, at: now });
        }
        break;

      case 'mp:update-inventory':
        if (po.mpId) {
          actions.push({
            type: 'plm:advance',
            target: po.mpId,
            data: { phase: 'In-Store', reason: `PO ${po.id} distributed` },
          });
          logs.push({ event: 'mp:advanced', mpId: po.mpId, phase: 'In-Store', at: now });
        }
        break;
    }
  }

  return { actions, logs };
}

// ═══════════════════════════════════════════════════════════
// MP Stage Side Effects
// ═══════════════════════════════════════════════════════════

function onMPStageAdvanced(mp, fromPhase, toPhase) {
  const actions = [];
  const logs = [];
  const now = new Date().toISOString();

  // When MP hits 'Approved' → enable PO creation
  if (toPhase === 'Approved') {
    logs.push({ event: 'mp:approved', mpId: mp.id, at: now });
    // No automatic action — just enables the "Create PO" button in UI
  }

  // When MP hits 'Reorder Review' → flag for reorder analysis
  if (toPhase === 'Reorder Review') {
    actions.push({
      type: 'mp:flag',
      target: mp.id,
      data: { flag: 'reorder-review', reason: 'Entered reorder review phase' },
    });
    logs.push({ event: 'mp:reorder-flagged', mpId: mp.id, at: now });
  }

  // When MP hits 'End of Life' → flag for liquidation
  if (toPhase === 'End of Life') {
    actions.push({
      type: 'mp:flag',
      target: mp.id,
      data: { flag: 'eol', reason: 'Product discontinued' },
    });
    logs.push({ event: 'mp:stage-changed', mpId: mp.id, from: fromPhase, to: toPhase, at: now });
  }

  return { actions, logs };
}

// ═══════════════════════════════════════════════════════════
// PO Payment Generation
// ═══════════════════════════════════════════════════════════

/**
 * Generate a payment schedule for a PO based on its fobTotal.
 * Uses the 30/40/30 split from domain.js PAYMENT_TYPES.
 * Returns an array of payment records.
 */
function generatePaymentSchedule(po, { terms = 'standard' } = {}) {
  const total = po.fobTotal || (po.fob || 0) * (po.units || 0);
  if (total <= 0) return [];

  const now = new Date();
  const lead = po.lead || 90;
  const payments = [];

  if (terms === 'standard' || terms === 'milestone') {
    // Deposit: 30% on order
    payments.push({
      id: `${po.id}-PMT-1`,
      type: 'deposit',
      label: 'Deposit (30%)',
      amount: +(total * 0.30).toFixed(2),
      pct: 30,
      dueDate: now.toISOString().slice(0, 10),
      status: 'due',
      paidDate: null,
      paidAmount: null,
    });

    // Production: 40% on ship
    const shipDate = new Date(now.getTime() + (lead * 0.7) * 86400000);
    payments.push({
      id: `${po.id}-PMT-2`,
      type: 'production',
      label: 'Production Balance (40%)',
      amount: +(total * 0.40).toFixed(2),
      pct: 40,
      dueDate: shipDate.toISOString().slice(0, 10),
      status: 'planned',
      paidDate: null,
      paidAmount: null,
    });

    // Balance: 30% on receipt
    const receiptDate = new Date(now.getTime() + lead * 86400000);
    payments.push({
      id: `${po.id}-PMT-3`,
      type: 'balance',
      label: 'Final Balance (30%)',
      amount: +(total * 0.30).toFixed(2),
      pct: 30,
      dueDate: receiptDate.toISOString().slice(0, 10),
      status: 'planned',
      paidDate: null,
      paidAmount: null,
    });
  } else if (terms === 'net30') {
    const dueDate = new Date(now.getTime() + 30 * 86400000);
    payments.push({
      id: `${po.id}-PMT-1`,
      type: 'full',
      label: 'Full Payment (Net 30)',
      amount: +total.toFixed(2),
      pct: 100,
      dueDate: dueDate.toISOString().slice(0, 10),
      status: 'planned',
      paidDate: null,
      paidAmount: null,
    });
  }

  // Add freight + duty estimates if we have the data
  const landed = landedCost(po.fob || 0, po.duty || 0);
  const freightDuty = (landed - (po.fob || 0)) * (po.units || 0);
  if (freightDuty > 0) {
    const arrivalDate = new Date(now.getTime() + lead * 86400000);
    payments.push({
      id: `${po.id}-PMT-F`,
      type: 'freight',
      label: 'Freight + Duty (estimated)',
      amount: +freightDuty.toFixed(2),
      pct: null,
      dueDate: arrivalDate.toISOString().slice(0, 10),
      status: 'planned',
      paidDate: null,
      paidAmount: null,
    });
  }

  return payments;
}

// ═══════════════════════════════════════════════════════════
// Payment Status Updates
// ═══════════════════════════════════════════════════════════

/**
 * Recompute payment statuses based on current date.
 * Call this periodically or on PO load.
 */
function refreshPaymentStatuses(payments) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  return payments.map(pmt => {
    if (pmt.status === 'paid') return pmt; // don't change paid

    const due = pmt.dueDate;
    if (!due) return pmt;

    let status = pmt.status;
    if (due < today) status = 'overdue';
    else if (due === today) status = 'due';
    else {
      const daysUntil = Math.round((new Date(due) - now) / 86400000);
      status = daysUntil <= 7 ? 'upcoming' : 'planned';
    }

    return { ...pmt, status };
  });
}

// ═══════════════════════════════════════════════════════════
// Action Executor
// ═══════════════════════════════════════════════════════════

/**
 * Execute a side effect action against the store.
 * Called by the Netlify function handler after computing effects.
 */
async function executeAction(action, store) {
  switch (action.type) {
    case 'shipment:create':
      await store.shipments.put(action.data.id, action.data);
      return { executed: true, type: action.type, id: action.data.id };

    case 'plm:advance':
      const existing = await store.plm.get(action.target).catch(() => null) || {};
      const updated = {
        ...existing,
        mpId: action.target,
        plmStage: action.data.phase,
        updatedAt: new Date().toISOString(),
        history: [...(existing.history || []), {
          from: existing.plmStage || 'Unknown',
          to: action.data.phase,
          at: new Date().toISOString(),
          reason: action.data.reason,
        }],
      };
      await store.plm.put(action.target, updated);
      return { executed: true, type: action.type, target: action.target };

    case 'mp:flag':
      const mpData = await store.plm.get(action.target).catch(() => null) || {};
      const flags = mpData.flags || [];
      if (!flags.includes(action.data.flag)) flags.push(action.data.flag);
      await store.plm.put(action.target, { ...mpData, mpId: action.target, flags, updatedAt: new Date().toISOString() });
      return { executed: true, type: action.type, target: action.target };

    case 'distribution:suggest':
      // Store suggestion on the PO for UI to display
      return { executed: true, type: action.type, suggestion: action.data.suggestion };

    case 'inventory:record-receipt':
      // Record but don't modify Shopify inventory (that's manual or via Shopify admin)
      return { executed: true, type: action.type, note: 'Receipt recorded, manual inventory update needed' };

    default:
      console.warn(`[effects] Unknown action type: ${action.type}`);
      return { executed: false, type: action.type, reason: 'unknown action' };
  }
}


module.exports = {
  onPOStageAdvanced,
  onMPStageAdvanced,
  generatePaymentSchedule,
  refreshPaymentStatuses,
  executeAction,
};
