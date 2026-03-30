/**
 * lib/product/stack.js — Stack Completeness Logic
 *
 * 10 sections, weighted completeness, PO gate checks.
 * See docs/PRODUCT_STACK_BUILDER.md for the full spec.
 *
 * Owner: Almond
 */

// ── Section definitions with required fields ─────────────

const SECTIONS = {
  construction: {
    weight: 25,
    required: ['construction_method', 'fabric_type', 'fabric_weight', 'fabric_composition', 'button_style'],
    conditionalRequired: { lining_type: ['Suits', 'Outerwear'], interlining: ['Suits'] },
    all: ['construction_method', 'fabric_type', 'fabric_weight', 'fabric_composition', 'fabric_mill',
      'lining_type', 'interlining', 'button_style', 'button_count', 'thread_spec', 'seam_type',
      'pocket_style', 'shoulder_type'],
  },
  fit_sizing: {
    weight: 20,
    required: ['fit_model', 'size_range', 'size_chart'],
    all: ['fit_model', 'size_range', 'size_chart', 'grading_spec', 'length_options',
      'fit_notes', 'measurement_points', 'tolerances'],
  },
  colorways: {
    weight: 5,
    required: ['colorways'],
    all: ['colorways', 'color_approval_status', 'lab_dip_images'],
  },
  tech_pack: {
    weight: 5,
    required: [],  // conditional: required for new products only
    conditionalRequired: { tech_pack_url: '_new_only' },
    all: ['tech_pack_url', 'tech_pack_version', 'construction_drawings', 'stitch_types',
      'seam_allowances', 'special_instructions'],
  },
  bom: {
    weight: 0,  // nice to have
    required: [],
    all: ['bom_items', 'total_material_cost', 'trim_list', 'thread_consumption'],
  },
  packaging: {
    weight: 15,
    required: ['garment_bag', 'hanger_type', 'tag_placement', 'barcode_format', 'sku_pattern'],
    all: ['garment_bag', 'hanger_type', 'tag_placement', 'barcode_format', 'sku_pattern',
      'carton_specs', 'shipping_marks', 'special_packaging'],
  },
  care_compliance: {
    weight: 10,
    required: ['country_of_origin', 'care_instructions', 'fiber_content_label'],
    all: ['country_of_origin', 'care_instructions', 'fiber_content_label', 'rn_number',
      'care_symbols', 'flammability', 'prop65_required'],
  },
  photography: {
    weight: 0,  // not blocking PO
    required: [],
    all: ['hero_image', 'shot_list', 'model_specs', 'description', 'tagline'],
  },
  pricing: {
    weight: 10,
    required: ['fob', 'duty', 'hts', 'retail'],
    all: ['fob', 'duty', 'hts', 'freight_per_unit', 'landed_cost', 'retail', 'margin_pct', 'markdown_schedule'],
  },
  vendor: {
    weight: 10,
    required: ['vendor_id', 'lead_days', 'moq', 'payment_terms'],
    all: ['vendor_id', 'lead_days', 'moq', 'payment_terms', 'vendor_contact', 'factory_address'],
  },
};

// ── Compute per-section and overall completeness ─────────

function computeCompleteness(stack, mp) {
  const merged = { ...mp, ...stack };
  const result = { sections: {}, overall: 0, ready: false, gaps: [] };

  let totalWeight = 0;
  let weightedSum = 0;
  const criticalSections = ['construction', 'fit_sizing', 'pricing', 'vendor'];
  let allCriticalComplete = true;

  for (const [sectionId, section] of Object.entries(SECTIONS)) {
    const required = [...section.required];
    let filled = 0;

    for (const field of required) {
      if (isFilled(merged[field])) filled++;
    }

    const pct = required.length > 0 ? Math.round((filled / required.length) * 100) : 100;

    result.sections[sectionId] = {
      completeness: pct,
      filled,
      total: required.length,
      missing: required.filter(f => !isFilled(merged[f])),
    };

    if (section.weight > 0) {
      totalWeight += section.weight;
      weightedSum += pct * section.weight;
    }

    if (criticalSections.includes(sectionId) && pct < 100) {
      allCriticalComplete = false;
      result.gaps.push({ section: sectionId, missing: result.sections[sectionId].missing });
    }
  }

  result.overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  result.ready = result.overall >= 80 && allCriticalComplete;

  return result;
}

function isFilled(val) {
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'number') return val > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return true;
}

// ── PO Stage Gate Checks ─────────────────────────────────

const STAGE_GATES = {
  design: {
    check: (completeness) => {
      const c = completeness.sections.construction;
      const f = completeness.sections.fit_sizing;
      return c.completeness >= 100 && f.completeness >= 100;
    },
    message: 'Construction and Fit & Sizing must be 100% complete',
  },
  sample: {
    check: (completeness, po) => {
      if (po.is_reorder) return true;
      return isFilled(completeness.sections.tech_pack) || true; // tech pack optional for now
    },
    message: 'Tech pack required for new products',
  },
  approved: {
    check: (completeness) => completeness.overall >= 80,
    message: 'Stack completeness must be at least 80%',
  },
  costed: {
    check: (completeness) => completeness.sections.pricing.completeness >= 100,
    message: 'Pricing section must be complete (FOB, duty, HTS, retail)',
  },
  ordered: {
    check: (completeness) => {
      const p = completeness.sections.packaging;
      const c = completeness.sections.care_compliance;
      const v = completeness.sections.vendor;
      return p.completeness >= 80 && c.completeness >= 100 && v.completeness >= 100;
    },
    message: 'Packaging (≥80%), Care & Compliance, and Vendor sections must be complete',
  },
};

/**
 * checkStackGate(stage, stack, mp, po)
 * Returns { passed: true } or { passed: false, reason, completeness }
 */
function checkStackGate(stage, stack, mp, po) {
  const gate = STAGE_GATES[stage];
  if (!gate) return { passed: true }; // no gate for this stage

  const completeness = computeCompleteness(stack, mp);
  const passed = gate.check(completeness, po);

  return {
    passed,
    reason: passed ? null : gate.message,
    completeness,
  };
}

module.exports = {
  SECTIONS,
  STAGE_GATES,
  computeCompleteness,
  checkStackGate,
};
