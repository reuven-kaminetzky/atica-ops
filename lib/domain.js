/**
 * ═══════════════════════════════════════════════════════════════════
 * DOMAIN MODEL — Atica Ops
 * 
 * This file defines the core entities, their states, relationships,
 * and the contracts between them. Everything in the system derives
 * from these definitions.
 * 
 * THREE INTERCONNECTED STATE MACHINES:
 *   1. MP Lifecycle (Product Stack) — what are we making?
 *   2. PO Lifecycle (Purchase Orders) — how are we buying it?
 *   3. Cash Flow — what does it cost and what does it earn?
 * 
 * Data flows:
 *   MP.approved → enables PO creation
 *   PO.created  → links to MP, costs feed Cash Flow (planned)
 *   PO.payment  → feeds Cash Flow (actual)
 *   PO.received → triggers inventory update + distribution
 *   Shopify orders → feeds Cash Flow (revenue) + Analytics
 *   Analytics velocity → feeds MP reorder signals
 *   MP.reorder  → triggers new PO suggestion
 * 
 * Owner: Architecture (Nikita)
 * ═══════════════════════════════════════════════════════════════════
 */

// ── MP LIFECYCLE (Product Stack) ────────────────────────────
// 
// The product lifecycle from concept to end-of-life.
// Each stage produces artifacts that accumulate into a "factory package."
// When you send a package to a factory, they get everything they need.

const MP_LIFECYCLE = [
  {
    id: 1, name: 'Concept',
    desc: 'Initial product idea, market gap identified',
    gate: null,
    artifacts: ['concept-brief'],
    canCreatePO: false,
  },
  {
    id: 2, name: 'Brief',
    desc: 'Design brief with target specs, market, retail price',
    gate: 'pd',
    artifacts: ['design-brief', 'target-specs', 'reference-images'],
    canCreatePO: false,
  },
  {
    id: 3, name: 'Sourcing',
    desc: 'Vendor identified, fabric/material sourced, prelim costing',
    gate: null,
    artifacts: ['vendor-quote', 'fabric-swatch', 'prelim-cost-sheet'],
    canCreatePO: false,
  },
  {
    id: 4, name: 'Sampling',
    desc: 'Counter sample requested, fit samples in progress',
    gate: null,
    artifacts: ['sample-request', 'fit-notes'],
    canCreatePO: false,
  },
  {
    id: 5, name: 'Sample Review',
    desc: 'Samples evaluated — fit, quality, construction',
    gate: 'pd',
    artifacts: ['sample-review', 'fit-approval', 'qc-notes'],
    canCreatePO: false,
  },
  {
    id: 6, name: 'Costing',
    desc: 'Final landed cost calculated, margin approved',
    gate: 'finance',
    artifacts: ['final-cost-sheet', 'margin-analysis', 'duty-calc'],
    canCreatePO: false,
  },
  {
    id: 7, name: 'Approved',
    desc: 'Product approved for production — PO can be created',
    gate: 'pd+finance',
    artifacts: ['approval-sign-off'],
    canCreatePO: true,  // ← THIS IS THE GATE
  },
  {
    id: 8, name: 'PO Created',
    desc: 'Purchase order placed with vendor',
    gate: null,
    artifacts: ['purchase-order'],
    canCreatePO: true,
    autoTransition: 'po:created', // advances when first PO is created
  },
  {
    id: 9, name: 'Production',
    desc: 'Factory is producing',
    gate: null,
    artifacts: ['production-photos', 'inline-inspection'],
    canCreatePO: true,
  },
  {
    id: 10, name: 'QC',
    desc: 'Quality control inspection',
    gate: 'pd',
    artifacts: ['qc-report', 'defect-log'],
    canCreatePO: false,
  },
  {
    id: 11, name: 'Shipping',
    desc: 'Goods shipped, in transit',
    gate: null,
    artifacts: ['shipping-docs', 'bill-of-lading', 'packing-list'],
    canCreatePO: false,
  },
  {
    id: 12, name: 'In-Store',
    desc: 'Product received and distributed to stores',
    gate: null,
    artifacts: ['receiving-report', 'distribution-log'],
    canCreatePO: true, // can reorder
  },
  {
    id: 13, name: 'Reorder Review',
    desc: 'Velocity + inventory reviewed, reorder decision pending',
    gate: 'pd+finance',
    artifacts: ['reorder-analysis', 'velocity-report'],
    canCreatePO: true,
  },
  {
    id: 14, name: 'End of Life',
    desc: 'Product discontinued, remaining stock to clear',
    gate: null,
    artifacts: ['eol-report', 'liquidation-plan'],
    canCreatePO: false,
  },
];


// ── PO LIFECYCLE ────────────────────────────────────────────
//
// Purchase order from concept to distribution.
// Each stage has data gates (what must be filled before advancing)
// and check-in gates (who must sign off).
// 
// PO MUST link to an MP. The MP provides: vendor, FOB, sizes, fits,
// duty, HTS, lead time, MOQ. These auto-fill on PO creation.

const PO_LIFECYCLE = [
  {
    id: 1, name: 'Concept',
    gate: null,
    dataGate: null,
    desc: 'PO idea — linked to MP',
  },
  {
    id: 2, name: 'Design',
    gate: 'pd',
    dataGate: { required: ['vendor'] },
    desc: 'Styles/colors selected, vendor confirmed',
  },
  {
    id: 3, name: 'Sample',
    gate: null,
    dataGate: { required: ['mpId'] },
    desc: 'Pre-production samples requested',
  },
  {
    id: 4, name: 'Approved',
    gate: 'pd',
    dataGate: null,
    desc: 'Samples approved, ready to cost',
  },
  {
    id: 5, name: 'Costed',
    gate: 'finance',
    dataGate: { required: ['fob', 'units'], rules: ['fob > 0', 'units > 0'] },
    desc: 'Final FOB + units locked, finance approved',
  },
  {
    id: 6, name: 'Ordered',
    gate: null,
    dataGate: null,
    desc: 'PO sent to vendor',
    sideEffects: ['mp:advance-to-po-created'],
  },
  {
    id: 7, name: 'Production',
    gate: null,
    dataGate: null,
    desc: 'Factory producing',
  },
  {
    id: 8, name: 'QC',
    gate: 'pd',
    dataGate: null,
    desc: 'Quality inspection',
  },
  {
    id: 9, name: 'Shipped',
    gate: null,
    dataGate: { required: ['etd'] },
    desc: 'Goods left factory',
  },
  {
    id: 10, name: 'In Transit',
    gate: null,
    dataGate: { required: ['container'] },
    desc: 'On the water/in the air',
    sideEffects: ['shipment:auto-create'],
  },
  {
    id: 11, name: 'Received',
    gate: 'finance',
    dataGate: null,
    desc: 'Goods arrived at warehouse',
    sideEffects: ['inventory:update', 'distribution:suggest'],
  },
  {
    id: 12, name: 'Distribution',
    gate: null,
    dataGate: null,
    desc: 'Distributed to stores per allocation weights',
    sideEffects: ['mp:update-inventory'],
  },
];


// ── PO PAYMENT SCHEDULE ─────────────────────────────────────
//
// Each PO has a payment schedule. Payments link POs to Cash Flow.
// Planned payments = future cash outflow.
// Actual payments = recorded cash outflow.

const PAYMENT_TYPES = [
  { id: 'deposit',   label: 'Deposit',           typical: 0.30, timing: 'on-order' },
  { id: 'production', label: 'Production Balance', typical: 0.40, timing: 'on-ship' },
  { id: 'balance',   label: 'Final Balance',      typical: 0.30, timing: 'on-receipt' },
  { id: 'freight',   label: 'Freight + Customs',  typical: null, timing: 'on-arrival' },
  { id: 'duty',      label: 'Customs Duty',       typical: null, timing: 'on-arrival' },
];

const PAYMENT_STATUSES = ['planned', 'upcoming', 'due', 'overdue', 'paid'];


// ── FACTORY PACKAGE ─────────────────────────────────────────
//
// When you send a factory package, it includes everything
// the vendor needs to produce the product. Built from MP + PO data.

const FACTORY_PACKAGE_SECTIONS = [
  {
    id: 'product-identity',
    label: 'Product Identity',
    sources: ['mp.name', 'mp.code', 'mp.cat', 'mp.heroImg'],
    desc: 'Product name, code, category, hero image',
  },
  {
    id: 'tech-specs',
    label: 'Technical Specifications',
    sources: ['mp.fits', 'mp.sizes', 'mp.features', 'mp.construction'],
    desc: 'Fits, size grading, construction details, features',
  },
  {
    id: 'materials',
    label: 'Materials & Components',
    sources: ['mp.fabric', 'mp.lining', 'mp.buttons', 'mp.components'],
    desc: 'Fabric, lining, buttons, zippers, labels, packaging',
  },
  {
    id: 'costing',
    label: 'Costing',
    sources: ['po.fob', 'po.units', 'po.fobTotal', 'mp.duty', 'mp.hts'],
    desc: 'FOB price, quantity, total, duty rate, HTS code',
  },
  {
    id: 'sizing',
    label: 'Size Breakdown',
    sources: ['po.sizeBreakdown', 'mp.sizeGroups'],
    desc: 'Units per size, core sizes highlighted',
  },
  {
    id: 'colorways',
    label: 'Colorways & Styles',
    sources: ['po.styles', 'mp.styles'],
    desc: 'Colors, fabric swatches, Pantone references',
  },
  {
    id: 'quality',
    label: 'Quality Requirements',
    sources: ['mp.qcSpecs', 'mp.tolerances'],
    desc: 'QC standards, measurement tolerances, defect criteria',
  },
  {
    id: 'shipping',
    label: 'Shipping Instructions',
    sources: ['po.etd', 'po.container', 'po.packingInstructions'],
    desc: 'Ship-by date, container requirements, packing method',
  },
  {
    id: 'compliance',
    label: 'Compliance & Labels',
    sources: ['mp.hts', 'mp.country', 'mp.labelSpecs'],
    desc: 'Country of origin, care labels, hang tags, UPC codes',
  },
];


// ── ENTITY RELATIONSHIPS ────────────────────────────────────
//
// How entities link to each other. This is the relational map.
//
// MP (1) ←→ (N) PO              — one product, many purchase orders
// PO (1) ←→ (N) Payment         — one PO, many payments
// PO (1) ←→ (1) Shipment        — one PO, one shipment (auto-created)
// MP (1) ←→ (N) Shopify Product — one MP matched to many Shopify products
// MP (1) ←→ (N) Component       — one MP uses many components (BOM)
// Vendor (1) ←→ (N) MP          — one vendor supplies many products
// Vendor (1) ←→ (N) PO          — one vendor has many POs
// PO.payment ←→ Cash Flow       — planned/actual costs
// Shopify Order ←→ Cash Flow    — actual revenue
// MP.velocity ←→ Reorder Signal — analytics drives production planning

const ENTITY_RELATIONS = {
  mp: {
    hasMany: ['pos', 'shopifyProducts', 'components', 'plmHistory', 'artifacts'],
    belongsTo: ['vendor', 'category'],
    feedsInto: ['reorderPlan', 'analytics', 'cashFlow'],
  },
  po: {
    hasMany: ['payments', 'stageHistory', 'checkIns'],
    hasOne: ['shipment'],
    belongsTo: ['mp', 'vendor'],
    feedsInto: ['cashFlow', 'inventory', 'analytics'],
  },
  payment: {
    belongsTo: ['po'],
    feedsInto: ['cashFlow'],
  },
  shipment: {
    belongsTo: ['po'],
    feedsInto: ['inventory'],
  },
  cashFlow: {
    receivesFrom: ['po.payments', 'shopify.orders'],
    projects: ['po.plannedPayments', 'mp.velocityForecast'],
  },
};


// ── CASH FLOW MODEL ─────────────────────────────────────────
//
// Cash flow is COMPUTED, not stored. It derives from:
// 1. Revenue (actual): Shopify orders
// 2. Revenue (projected): velocity × retail × 4.33/mo × seasonal
// 3. Costs (actual): PO payments marked 'paid'
// 4. Costs (planned): PO payments marked 'planned'/'upcoming'/'due'
// 5. OpEx: $25K/month (configurable)
//
// 12-week forward projection:
// For each future week:
//   revenue = adjustedWeeklyVelocity × avgRetail
//   costs = sum of PO payments due that week
//   net = revenue - costs - weeklyOpEx

const CASH_FLOW_CONFIG = {
  opexMonthly: 25000,            // monthly operating expenses
  projectionWeeks: 12,            // forward projection horizon
  revenueFormula: 'velocity × retail × 4.33 × seasonalMultiplier',
  costSources: ['po.payments'],
  revenueSources: ['shopify.orders', 'projected.velocity'],
};


// ── STATUS DERIVATION ───────────────────────────────────────
//
// MP status is DERIVED from its data, not manually set.
// This is how you check "where is this product?"

const MP_STATUS_RULES = {
  // Status is computed from: plmStage + activePOs + inventory + velocity
  compute: (mp) => {
    const rules = {
      // No stock, no POs, early PLM → still developing
      developing: mp.plmStage < 7 && mp.activePOs === 0,
      // PLM approved, no POs yet → ready to order
      readyToOrder: mp.plmStage >= 7 && mp.activePOs === 0 && mp.totalInventory === 0,
      // Has active POs → on order
      onOrder: mp.activePOs > 0 && mp.totalInventory === 0,
      // Has stock + active POs → replenishing
      replenishing: mp.activePOs > 0 && mp.totalInventory > 0,
      // Has stock, no POs, selling well → in-store (healthy)
      inStore: mp.totalInventory > 0 && mp.activePOs === 0 && mp.daysOfStock > 60,
      // Has stock, no POs, running low → needs reorder
      needsReorder: mp.totalInventory > 0 && mp.activePOs === 0 && mp.daysOfStock <= 60,
      // Zero stock, had sales → stockout
      stockout: mp.totalInventory === 0 && mp.unitsSold > 0 && mp.plmStage >= 12,
      // PLM at EOL → discontinuing
      endOfLife: mp.plmStage >= 14,
    };
    // Return first matching status
    for (const [status, condition] of Object.entries(rules)) {
      if (condition) return status;
    }
    return 'unknown';
  },
};


// ── EVENT CONTRACTS ─────────────────────────────────────────
//
// When state changes happen, these events fire.
// This is the contract between the state machines.

const DOMAIN_EVENTS = {
  // MP lifecycle events
  'mp:stage-changed':     { data: 'mpId, fromStage, toStage, checkedBy', triggers: ['update-mp-status'] },
  'mp:approved':          { data: 'mpId', triggers: ['enable-po-creation'] },
  'mp:reorder-flagged':   { data: 'mpId, suggestedQty, urgency', triggers: ['suggest-po'] },

  // PO lifecycle events
  'po:created':           { data: 'poId, mpId, vendor, units, fobTotal', triggers: ['mp:advance-to-po-created', 'cashflow:add-planned-payments'] },
  'po:stage-advanced':    { data: 'poId, fromStage, toStage', triggers: ['update-po-status'] },
  'po:costed':            { data: 'poId, fob, units, fobTotal', triggers: ['cashflow:update-planned-cost'] },
  'po:ordered':           { data: 'poId', triggers: ['mp:advance-to-po-created'] },
  'po:shipped':           { data: 'poId, etd, container', triggers: ['shipment:create'] },
  'po:received':          { data: 'poId, units', triggers: ['inventory:add', 'distribution:suggest', 'cashflow:record-receipt'] },
  'po:payment-made':      { data: 'poId, paymentId, amount', triggers: ['cashflow:record-payment'] },

  // Cash flow events
  'cashflow:payment-due': { data: 'poId, paymentId, amount, dueDate', triggers: ['alert:payment-due'] },
  'cashflow:payment-overdue': { data: 'poId, paymentId, amount, daysOverdue', triggers: ['alert:payment-overdue'] },

  // Inventory events
  'inventory:received':   { data: 'mpId, units, location', triggers: ['distribution:suggest'] },
  'inventory:low':        { data: 'mpId, currentStock, daysOfStock', triggers: ['mp:reorder-flagged'] },

  // Analytics events (computed, not stored)
  'analytics:velocity-updated': { data: 'mpId, velocity, signal', triggers: ['reorder:recalculate'] },
};


// ── EXPORTS ─────────────────────────────────────────────────

module.exports = {
  MP_LIFECYCLE,
  PO_LIFECYCLE,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
  FACTORY_PACKAGE_SECTIONS,
  ENTITY_RELATIONS,
  CASH_FLOW_CONFIG,
  MP_STATUS_RULES,
  DOMAIN_EVENTS,
};
