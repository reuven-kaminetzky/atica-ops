/**
 * lib/workflow.js — Compute Layer
 * 
 * Imports schemas from lib/domain.js (the canonical model).
 * Provides the FUNCTIONS that operate on those schemas:
 *   - computeMPStatus()     → unified MP health check
 *   - buildFactoryPackage() → tech pack for vendors
 *   - projectCashFlow()     → 3-month P&L from PO payments + revenue
 * 
 * domain.js = WHAT things are (schemas, stages, relationships)
 * workflow.js = HOW things work (computations, projections, generators)
 */

const {
  MP_LIFECYCLE,
  FACTORY_PACKAGE_SECTIONS,
  CASH_FLOW_CONFIG,
  MP_STATUS_RULES,
} = require('./domain');

// ═══════════════════════════════════════════════════════════
// 1. MP STATUS — unified health for one product
// ═══════════════════════════════════════════════════════════

function computeMPStatus(mp, { pos, inventory, velocity, plmData }) {
  const activePOs = (pos || []).filter(po =>
    po.mpId === mp.id && !['Received', 'Distribution'].includes(po.stage)
  );
  const completedPOs = (pos || []).filter(po =>
    po.mpId === mp.id && ['Received', 'Distribution'].includes(po.stage)
  );

  const stock = typeof inventory === 'object' && !Array.isArray(inventory)
    ? (inventory[mp.id] || 0)
    : (inventory || 0);
  const vel = velocity?.[mp.id] || { unitsPerDay: 0, signal: 'steady' };
  const plm = plmData?.[mp.id] || {};

  const committedCost = activePOs.reduce((s, po) => s + (po.fobTotal || 0), 0);
  const incomingUnits = activePOs.reduce((s, po) => s + (po.units || 0), 0);
  const daysOfStock = vel.unitsPerDay > 0
    ? Math.round(stock / vel.unitsPerDay)
    : stock > 0 ? 999 : 0;

  // Flags
  const flags = [];
  if (stock === 0 && vel.unitsPerDay > 0) flags.push('stockout');
  if (daysOfStock > 0 && daysOfStock < 30 && daysOfStock < 999 && activePOs.length === 0) flags.push('reorder-needed');
  if (activePOs.some(po => po.qcStatus === 'failed')) flags.push('qc-issue');

  const now = new Date();
  const overduePayments = activePOs.flatMap(po =>
    (po.payments || []).filter(p => p.status !== 'paid' && p.dueDate && new Date(p.dueDate) < now)
  );
  if (overduePayments.length > 0) flags.push('payment-overdue');

  // Derive status
  const plmStageId = plm.phaseId || plm.plmStageId || 12;
  const derivedStatus = MP_STATUS_RULES.compute({
    plmStage: plmStageId,
    activePOs: activePOs.length,
    totalInventory: stock,
    daysOfStock,
    unitsSold: vel.units || 0,
  });

  return {
    mpId: mp.id,
    name: mp.name,
    code: mp.code,
    cat: mp.cat,
    vendor: mp.vendor,
    phase: plm.phase || plm.plmStage || 'In-Store',
    derivedStatus,
    activePOs: activePOs.length,
    activePOStages: activePOs.map(po => ({ id: po.id, stage: po.stage, units: po.units })),
    completedPOs: completedPOs.length,
    committedCost: +committedCost.toFixed(2),
    incomingUnits,
    currentStock: stock,
    daysOfStock,
    unitsPerDay: vel.unitsPerDay || 0,
    signal: vel.signal || 'steady',
    flags,
    overduePayments: overduePayments.length,
    health: flags.length === 0 ? 'healthy'
      : flags.includes('stockout') || flags.includes('payment-overdue') ? 'critical'
      : flags.includes('qc-issue') ? 'warning'
      : 'attention',
  };
}

// ═══════════════════════════════════════════════════════════
// 2. FACTORY PACKAGE
// ═══════════════════════════════════════════════════════════

function buildFactoryPackage(mp, stackData, po) {
  const sd = stackData || {};
  const pkg = {
    _generated: new Date().toISOString(),
    _version: '2.0',
    productIdentity: {
      name: mp.name, code: mp.code, category: mp.cat,
      description: sd.description || '', heroImage: mp.heroImg || null,
    },
    techSpecs: {
      fits: mp.fits || [], sizes: mp.sizes || '',
      features: sd.features || mp.features || [], construction: sd.construction || '',
    },
    materials: {
      fabricType: sd.fabricType || '', fabricWeight: sd.fabricWeight || '',
      fabricComp: sd.fabricComp || '', fabricMill: sd.fabricMill || '',
      lining: sd.lining || '', buttons: sd.buttons || '',
      labels: sd.labels || '', packaging: sd.packaging || '',
    },
    costing: {
      fob: mp.fob || 0, moq: mp.moq || 0, lead: mp.lead || 0,
      duty: mp.duty || 0, hts: mp.hts || '',
      landedCost: mp.fob ? +(mp.fob * (1 + (mp.duty || 0) / 100 + 0.08)).toFixed(2) : 0,
    },
    sizeBreakdown: po ? {
      totalUnits: po.units || 0, styles: po.styles || [],
      sizes: po.sizes || mp.sizes || '', fits: po.fits || mp.fits || [],
    } : { totalUnits: 0, styles: [], sizes: mp.sizes || '', fits: mp.fits || [] },
    colorways: sd.colorways || [],
    quality: {
      aqlLevel: sd.aqlLevel || '2.5', qcChecklist: sd.qcChecklist || [],
      tolerances: sd.tolerances || '',
    },
    shipping: po ? {
      etd: po.etd || null, container: po.container || null,
      packingInstructions: sd.packingInstructions || '',
    } : { etd: null, container: null, packingInstructions: sd.packingInstructions || '' },
    compliance: {
      countryOfOrigin: sd.countryOfOrigin || '',
      careLabels: sd.careLabels || '', hangTags: sd.hangTags || '',
    },
  };

  // Completeness from FACTORY_PACKAGE_SECTIONS sources
  let filled = 0, total = 0;
  for (const section of FACTORY_PACKAGE_SECTIONS) {
    for (const source of section.sources) {
      total++;
      const [entity, field] = source.split('.');
      let val = null;
      if (entity === 'mp') val = mp[field];
      else if (entity === 'po' && po) val = po[field];
      if (val && val !== '' && !(Array.isArray(val) && val.length === 0)) filled++;
    }
  }
  pkg.completeness = total > 0 ? Math.round((filled / total) * 100) : 0;
  return pkg;
}

// ═══════════════════════════════════════════════════════════
// 3. CASH FLOW PROJECTION
// ═══════════════════════════════════════════════════════════

function projectCashFlow(pos, salesData, months) {
  const now = new Date();
  const opex = CASH_FLOW_CONFIG.opexMonthly;
  const n = months || 3;
  const projections = [];

  for (let m = 0; m < n; m++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
    const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    let poPayments = 0, paidPayments = 0;
    const details = [];
    for (const po of (pos || [])) {
      for (const pmt of (po.payments || [])) {
        const due = new Date(pmt.dueDate || pmt.due);
        if (isNaN(due.getTime())) continue;
        if (due >= monthStart && due <= monthEnd) {
          const amt = pmt.amount || 0;
          poPayments += amt;
          if (pmt.status === 'paid') paidPayments += amt;
          details.push({ poId: po.id, type: pmt.type, amount: amt, status: pmt.status, vendor: po.vendor });
        }
      }
    }

    const projectedRevenue = salesData?.revenuePerMonth || 0;
    const actualRevenue = m === 0 ? (salesData?.currentMonthRevenue || 0) : 0;

    projections.push({
      month: label,
      monthStart: monthStart.toISOString().slice(0, 10),
      outflow: { poPayments: +poPayments.toFixed(2), poPaid: +paidPayments.toFixed(2), opex, total: +(poPayments + opex).toFixed(2), details },
      inflow: { projected: +projectedRevenue.toFixed(2), actual: +actualRevenue.toFixed(2) },
      net: { projected: +(projectedRevenue - poPayments - opex).toFixed(2), actual: m === 0 ? +(actualRevenue - paidPayments - opex).toFixed(2) : null },
    });
  }
  return projections;
}

module.exports = { computeMPStatus, buildFactoryPackage, projectCashFlow };
