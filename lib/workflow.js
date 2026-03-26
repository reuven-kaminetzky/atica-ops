/**
 * lib/workflow.js — Unified Workflow Engine
 * 
 * THE GLUE between MPs, POs, cash flow, and analytics.
 * 
 * This module defines:
 * 1. MP Product Stack (6 phases with required fields + gates)
 * 2. PO lifecycle integration (MP → PO creation, PO → MP completion)
 * 3. Cash flow data model (planned vs actual, inflow vs outflow)
 * 4. Status aggregation (cross-cutting view of everything)
 * 5. Factory package schema (what a vendor needs)
 * 
 * DESIGN PRINCIPLES:
 * - Data flows ONE direction: MP → PO → Shipment → Stock → Analytics
 * - Every state change is recorded with who/when/why
 * - Planned vs Actual is tracked separately (forecasting vs reality)
 * - Status is always computed, never stored (derive from source data)
 */

// ═══════════════════════════════════════════════════════════
// 1. PRODUCT STACK — MP Lifecycle
// ═══════════════════════════════════════════════════════════
// 
// This replaces the 18-stage PLM with a practical 6-phase model
// aligned with the original prototype. Each phase has:
// - required: fields that MUST be filled before advancing
// - optional: fields that SHOULD be filled
// - gate: who approves the transition
// - outputs: what this phase produces (documents, decisions)

const PRODUCT_STACK = [
  {
    id: 1,
    phase: 'Brief',
    desc: 'Product concept, target market, initial specs',
    gate: null,
    required: ['name', 'code', 'cat', 'targetRetail', 'targetMargin', 'season'],
    optional: ['inspiration', 'competitors', 'notes'],
    outputs: ['Product brief document'],
    triggers: [], // nothing triggers from Brief
  },
  {
    id: 2,
    phase: 'Sourcing',
    desc: 'Vendor selection, fabric/component sourcing, initial quotes',
    gate: 'PD',
    required: ['vendor', 'fabricType', 'estimatedFob'],
    optional: ['fabricMill', 'components', 'alternateVendors', 'moq'],
    outputs: ['Vendor shortlist', 'Fabric swatches', 'Initial quote'],
    triggers: [], // nothing triggers from Sourcing
  },
  {
    id: 3,
    phase: 'Development',
    desc: 'Sampling, fit sessions, pattern adjustments',
    gate: 'PD',
    required: ['sampleStatus', 'fits', 'sizes', 'techPackComplete'],
    optional: ['samplePhotos', 'fitNotes', 'patternAdjustments', 'washTest'],
    outputs: ['Approved sample', 'Tech pack', 'Size spec'],
    triggers: [], // nothing triggers from Development
  },
  {
    id: 4,
    phase: 'Costing',
    desc: 'Final pricing, margin validation, finance approval',
    gate: 'Finance',
    required: ['fob', 'duty', 'freight', 'landedCost', 'retail', 'margin'],
    optional: ['hts', 'countryOfOrigin', 'lead', 'paymentTerms'],
    outputs: ['Cost sheet', 'Margin analysis'],
    triggers: [
      // When costing is approved, system can auto-suggest a PO
      { event: 'po:suggest', condition: 'margin >= targetMargin' }
    ],
  },
  {
    id: 5,
    phase: 'Content',
    desc: 'Photography, copywriting, Shopify listing prep',
    gate: null,
    required: ['heroImage', 'description', 'shopifyReady'],
    optional: ['additionalImages', 'features', 'tagline', 'seoTitle'],
    outputs: ['Product photos', 'Shopify listing', 'Marketing assets'],
    triggers: [],
  },
  {
    id: 6,
    phase: 'Launch',
    desc: 'Go live — product available in stores and online',
    gate: 'PD',
    required: ['shopifyPublished', 'initialPO'],
    optional: ['launchDate', 'campaign', 'distributionPlan'],
    outputs: ['Live product', 'Initial PO placed'],
    triggers: [
      { event: 'mp:launched', condition: 'always' }
    ],
  },
];

// After Launch, the product enters ongoing lifecycle:
// In-Store → Reorder Review → End of Life
const ONGOING_PHASES = [
  { id: 7, phase: 'In-Store',       desc: 'Active selling, reorder as needed' },
  { id: 8, phase: 'Reorder Review', desc: 'Evaluate: continue, modify, or discontinue', gate: 'PD + Finance' },
  { id: 9, phase: 'End of Life',    desc: 'Discontinued, liquidate remaining stock' },
];

// ═══════════════════════════════════════════════════════════
// 2. PO ↔ MP INTEGRATION
// ═══════════════════════════════════════════════════════════
//
// How POs and MPs talk to each other:
//
// MP → PO (downstream):
//   When MP.phase = 'Costing' approved → suggest PO with auto-filled data
//   When MP.phase = 'Launch' → require at least one active PO
//
// PO → MP (upstream):
//   When PO.stage = 'Received' → MP should move to 'In-Store' (if first PO)
//   When PO.stage = 'QC' failed → MP flags need attention
//   When ALL POs for MP are complete + stock depleted → MP → 'Reorder Review'

const MP_PO_TRIGGERS = {
  // MP phase changes that affect POs
  'mp:costing-approved': {
    desc: 'MP costing approved → suggest creating a PO',
    action: 'suggest-po',
    autoFill: ['vendor', 'fob', 'units:moq', 'lead', 'duty', 'hts', 'sizes', 'fits'],
  },
  'mp:launched': {
    desc: 'MP launched → verify at least one PO exists',
    action: 'verify-po-exists',
  },

  // PO stage changes that affect MPs
  'po:received': {
    desc: 'PO goods received → update MP to In-Store',
    action: 'advance-mp',
    targetPhase: 'In-Store',
    condition: 'first-po-for-mp',
  },
  'po:qc-failed': {
    desc: 'PO QC failed → flag MP for attention',
    action: 'flag-mp',
    flag: 'qc-issue',
  },
};

// ═══════════════════════════════════════════════════════════
// 3. CASH FLOW DATA MODEL
// ═══════════════════════════════════════════════════════════
//
// Cash flow has two sides:
//   OUTFLOW = money going out (PO payments, opex)
//   INFLOW  = money coming in (Shopify orders, wholesale)
//
// Each side has PLANNED and ACTUAL:
//   Planned outflow = PO payment schedule (deposit due, balance due)
//   Actual outflow  = PO payments made
//   Planned inflow  = velocity × retail × seasonal × 4.33 weeks/month
//   Actual inflow   = Shopify order revenue
//
// The gap between planned and actual is the variance.

const CASH_FLOW_CATEGORIES = {
  outflow: {
    'po-deposit':    { desc: 'PO deposit payments (typically 30-50%)', planned: true, actual: true },
    'po-balance':    { desc: 'PO balance payments on shipment', planned: true, actual: true },
    'po-freight':    { desc: 'Freight, brokerage, customs duty', planned: true, actual: true },
    'opex':          { desc: 'Operating expenses ($25K/mo default)', planned: true, actual: false },
    'marketing':     { desc: 'Campaign spend', planned: true, actual: true },
  },
  inflow: {
    'shopify-orders': { desc: 'Online sales revenue', planned: true, actual: true },
    'pos-sales':      { desc: 'Retail store POS sales', planned: true, actual: true },
    'wholesale':      { desc: 'Wholesale account payments', planned: true, actual: true },
  },
};

// PO Payment schedule template
// Each PO should have a payments array like:
// [
//   { type: 'deposit', pct: 50, amount: 5000, dueDate: '2026-04-01', status: 'paid', paidDate: '2026-03-28' },
//   { type: 'balance', pct: 50, amount: 5000, dueDate: '2026-06-01', status: 'due', paidDate: null },
// ]
const DEFAULT_PAYMENT_TERMS = {
  standard:  [{ type: 'deposit', pct: 50 }, { type: 'balance', pct: 50, trigger: 'on-shipment' }],
  net30:     [{ type: 'full', pct: 100, trigger: 'net-30-from-shipment' }],
  milestone: [{ type: 'deposit', pct: 30 }, { type: 'production', pct: 40, trigger: 'production-complete' }, { type: 'balance', pct: 30, trigger: 'on-shipment' }],
};

// ═══════════════════════════════════════════════════════════
// 4. STATUS AGGREGATION
// ═══════════════════════════════════════════════════════════
//
// Computes a unified status for each MP by combining:
// - Product stack phase + progress
// - Active PO count + stages
// - Current stock level
// - Velocity + demand signal
// - Cash committed (open PO cost)
// - Flags (QC issues, reorder needed, etc.)

function computeMPStatus(mp, { pos, inventory, velocity, plmData }) {
  const activePOs = (pos || []).filter(po =>
    po.mpId === mp.id && !['Received', 'Distribution'].includes(po.stage)
  );
  const completedPOs = (pos || []).filter(po =>
    po.mpId === mp.id && ['Received', 'Distribution'].includes(po.stage)
  );

  const stock = inventory?.[mp.id] || 0;
  const vel = velocity?.[mp.id] || { unitsPerDay: 0, signal: 'steady' };
  const plm = plmData?.[mp.id] || {};

  const committedCost = activePOs.reduce((s, po) => s + (po.fobTotal || 0), 0);
  const incomingUnits = activePOs.reduce((s, po) => s + (po.units || 0), 0);
  const daysOfStock = vel.unitsPerDay > 0 ? Math.round(stock / vel.unitsPerDay) : stock > 0 ? 999 : 0;

  // Flags
  const flags = [];
  if (stock === 0 && vel.unitsPerDay > 0) flags.push('stockout');
  if (daysOfStock < 30 && daysOfStock < 999 && activePOs.length === 0) flags.push('reorder-needed');
  if (activePOs.some(po => po.stage === 'QC' && po.qcStatus === 'failed')) flags.push('qc-issue');
  if (plm.phase === 'Reorder Review') flags.push('review-pending');

  return {
    mpId: mp.id,
    name: mp.name,
    code: mp.code,
    cat: mp.cat,
    vendor: mp.vendor,

    // Product stack
    phase: plm.phase || 'In-Store',
    phaseId: plm.phaseId || 7,

    // PO status
    activePOs: activePOs.length,
    activePOStages: activePOs.map(po => ({ id: po.id, stage: po.stage })),
    completedPOs: completedPOs.length,
    committedCost,
    incomingUnits,

    // Inventory
    currentStock: stock,
    daysOfStock,

    // Velocity
    unitsPerDay: vel.unitsPerDay,
    signal: vel.signal,

    // Health
    flags,
    health: flags.length === 0 ? 'healthy'
      : flags.includes('stockout') ? 'critical'
      : flags.includes('qc-issue') ? 'warning'
      : 'attention',
  };
}

// ═══════════════════════════════════════════════════════════
// 5. FACTORY PACKAGE SCHEMA
// ═══════════════════════════════════════════════════════════
//
// What goes in a tech pack / factory package:
// Everything the vendor needs to produce the product.

const FACTORY_PACKAGE_SCHEMA = {
  product: {
    required: ['name', 'code', 'cat', 'description'],
    optional: ['tagline', 'features'],
  },
  specifications: {
    required: ['sizes', 'fits', 'fabricType'],
    optional: ['fabricWeight', 'fabricComp', 'fabricMill', 'colorways', 'washCare'],
  },
  construction: {
    required: [],
    optional: ['seams', 'stitching', 'buttons', 'zippers', 'lining', 'interlining', 'labels', 'packaging'],
  },
  sizing: {
    required: ['sizeChart', 'grading'],
    optional: ['fitNotes', 'tolerances', 'measurementPoints'],
  },
  pricing: {
    required: ['fob', 'moq', 'lead'],
    optional: ['duty', 'hts', 'freight', 'paymentTerms'],
  },
  quality: {
    required: [],
    optional: ['qcChecklist', 'aqlLevel', 'testReports', 'approvedSamples'],
  },
  logistics: {
    required: [],
    optional: ['packingInstructions', 'labelRequirements', 'shippingMarks', 'cartonSpecs'],
  },
};

function buildFactoryPackage(mp, stackData) {
  const pkg = {
    _generated: new Date().toISOString(),
    _version: '1.0',
    product: {
      name: mp.name,
      code: mp.code,
      category: mp.cat,
      description: stackData?.description || '',
      tagline: stackData?.tagline || mp.tagline || '',
      features: stackData?.features || mp.features || [],
    },
    specifications: {
      sizes: mp.sizes || '',
      fits: mp.fits || [],
      fabricType: stackData?.fabricType || '',
      fabricWeight: stackData?.fabricWeight || '',
      fabricComp: stackData?.fabricComp || '',
      fabricMill: stackData?.fabricMill || '',
      colorways: stackData?.colorways || [],
      washCare: stackData?.washCare || '',
    },
    construction: {
      seams: stackData?.seams || '',
      stitching: stackData?.stitching || '',
      buttons: stackData?.buttons || '',
      zippers: stackData?.zippers || '',
      lining: stackData?.lining || '',
      interlining: stackData?.interlining || '',
      labels: stackData?.labels || '',
      packaging: stackData?.packaging || '',
    },
    sizing: {
      sizeChart: stackData?.sizeChart || null,
      grading: stackData?.grading || null,
      fitNotes: stackData?.fitNotes || '',
      tolerances: stackData?.tolerances || '',
    },
    pricing: {
      fob: mp.fob,
      moq: mp.moq,
      lead: mp.lead,
      duty: mp.duty,
      hts: mp.hts,
      paymentTerms: stackData?.paymentTerms || 'standard',
    },
    quality: {
      qcChecklist: stackData?.qcChecklist || [],
      aqlLevel: stackData?.aqlLevel || '2.5',
      testReports: stackData?.testReports || [],
    },
    logistics: {
      packingInstructions: stackData?.packingInstructions || '',
      labelRequirements: stackData?.labelRequirements || '',
      shippingMarks: stackData?.shippingMarks || '',
    },
    // Completeness score
    completeness: null,
  };

  // Compute completeness
  let filled = 0;
  let total = 0;
  for (const [section, schema] of Object.entries(FACTORY_PACKAGE_SCHEMA)) {
    for (const field of schema.required) {
      total++;
      const val = pkg[section]?.[field];
      if (val && val !== '' && !(Array.isArray(val) && val.length === 0)) filled++;
    }
  }
  pkg.completeness = total > 0 ? Math.round((filled / total) * 100) : 0;

  return pkg;
}

// ═══════════════════════════════════════════════════════════
// 6. CASH FLOW PROJECTION
// ═══════════════════════════════════════════════════════════

function projectCashFlow(pos, salesData, months = 3) {
  const now = new Date();
  const projections = [];

  for (let m = 0; m < months; m++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Outflow: PO payments due this month
    let plannedOutflow = 0;
    let actualOutflow = 0;
    for (const po of pos) {
      for (const pmt of (po.payments || [])) {
        const due = new Date(pmt.dueDate || pmt.due);
        if (due >= monthStart && due <= monthEnd) {
          plannedOutflow += pmt.amount || 0;
          if (pmt.status === 'paid') actualOutflow += pmt.amount || 0;
        }
      }
    }

    // Add opex
    const opex = 25000; // $25K/mo default
    plannedOutflow += opex;

    // Inflow: projected from velocity (planned) or actual Shopify data
    const plannedInflow = salesData?.revenuePerMonth || 0;
    const actualInflow = m === 0 ? (salesData?.currentMonthRevenue || 0) : 0;

    projections.push({
      month: monthLabel,
      monthStart: monthStart.toISOString().slice(0, 10),
      outflow: {
        planned: +plannedOutflow.toFixed(2),
        actual: +actualOutflow.toFixed(2),
        poPayments: +(plannedOutflow - opex).toFixed(2),
        opex,
      },
      inflow: {
        planned: +plannedInflow.toFixed(2),
        actual: +actualInflow.toFixed(2),
      },
      net: {
        planned: +(plannedInflow - plannedOutflow).toFixed(2),
        actual: +(actualInflow - actualOutflow).toFixed(2),
      },
    });
  }

  return projections;
}


module.exports = {
  // Product Stack
  PRODUCT_STACK,
  ONGOING_PHASES,

  // Integration
  MP_PO_TRIGGERS,

  // Cash Flow
  CASH_FLOW_CATEGORIES,
  DEFAULT_PAYMENT_TERMS,
  projectCashFlow,

  // Status
  computeMPStatus,

  // Factory Package
  FACTORY_PACKAGE_SCHEMA,
  buildFactoryPackage,
};
