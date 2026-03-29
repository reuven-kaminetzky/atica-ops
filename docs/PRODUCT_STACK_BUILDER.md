# Product Stack Builder — Design Spec

## Why This Matters

The product stack is the DNA of every product. If PD doesn't set it up
correctly, you manufacture wrong, package wrong, label wrong, sell wrong.
Currently the stack editor is 12 free-text fields. No structure, no 
validation, no sections, no completeness enforcement. For a $7.5M
menswear operation producing from factories in China, the stack must
be comprehensive and structured.

## What the Stack Must Contain

### Section 1: CONSTRUCTION (required for all)
**Purpose:** How the garment is built.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| construction_method | select | YES | half-canvas / full-canvas / fused / unstructured |
| fabric_type | text | YES | Italian wool twill |
| fabric_weight | text | YES | 260gsm |
| fabric_composition | text | YES | 100% Super 130's Merino wool |
| fabric_mill | text | no | Vitale Barberis Canonico |
| lining_type | text | YES (suits/blazers) | Bemberg cupro, full lining |
| interlining | text | YES (suits/blazers) | Hair canvas chest piece |
| button_style | text | YES | Real horn, 4-hole, 20L |
| button_count | json | no | { jacket: 6, sleeve: 4, pants: 1 } |
| thread_spec | text | no | Gutermann Mara 80, matching |
| seam_type | text | no | Open seam, pressed |
| pocket_style | text | no | Jetted, flap, welt |
| shoulder_type | select | no | natural / padded / soft / roped |

**Completeness:** Count required fields filled / total required.
**Gate:** PO cannot advance past DESIGN without Construction ≥ 100%.

---

### Section 2: FIT & SIZING (required for all)
**Purpose:** How the garment fits and which sizes exist.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| fit_model | select | YES | Lorenzo 6 Drop / Alexander 4 Drop / Slim / etc. |
| size_range | text | YES | 36-52 (suits), S-3XL (shirts) |
| size_chart | json | YES | { "38": { chest: 38, waist: 32, length: 29 }, ... } |
| grading_spec | json | no | { increment: 1, chest_per_size: 1.5 } |
| length_options | text[] | no | ["Short", "Regular", "Long"] |
| fit_notes | text | no | Slim through chest, slightly tapered |
| measurement_points | json | no | [{ name: "Chest", method: "1 below armhole" }] |
| tolerances | text | no | ±0.5cm on critical measurements |

**Completeness:** fit_model + size_range + size_chart = 100%.
**Gate:** PO cannot advance past DESIGN without Fit & Sizing ≥ 100%.

---

### Section 3: COLORWAYS (per PO, not per stack)
**Purpose:** Which colors are available for this product.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| colorways | json[] | YES | [{ name: "Navy", pantone: "19-4026", fabric_ref: "VBC-2234" }] |
| color_approval_status | select | no | pending / approved / rejected |
| lab_dip_images | text[] | no | [URLs] |

**Note:** Colorways may vary per PO. The stack defines what's AVAILABLE.
The PO defines what's ORDERED for this specific production run.

**Gate:** At least 1 colorway defined.

---

### Section 4: TECH PACK (required for new products)
**Purpose:** Technical drawings and construction details for the factory.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| tech_pack_url | text | NEW only | URL to PDF/image |
| tech_pack_version | text | no | v3.2 |
| construction_drawings | text[] | no | [URLs — front, back, detail views] |
| stitch_types | json | no | { "main": "301 lockstitch", "hem": "103 blindstitch" } |
| seam_allowances | text | no | 1cm body, 2cm hem |
| special_instructions | text | no | Match stripes at side seam |

**Gate:** For new products (not reorders), tech_pack_url required before SAMPLE.

---

### Section 5: BILL OF MATERIALS (BOM)
**Purpose:** What goes into each unit. Drives cost and vendor ordering.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| bom_items | json[] | no | [{ item: "Shell fabric", unit: "meters", qty_per_unit: 2.8, cost: 18.50 }] |
| total_material_cost | numeric | computed | Sum of bom_items costs |
| trim_list | json[] | no | [{ item: "Buttons", qty: 10, supplier: "YKK" }] |
| thread_consumption | text | no | 250m per garment |

**Gate:** None — nice to have but not blocking.

---

### Section 6: PACKAGING & LABELING (required before ORDERED)
**Purpose:** How the finished product is packaged and labeled.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| garment_bag | select | YES | poly-bag / suit-bag / none |
| hanger_type | select | YES | wire / wood / clip / none |
| tag_placement | text | YES | Price tag on sleeve, brand tag on collar |
| barcode_format | select | YES | UPC-A / EAN-13 |
| sku_pattern | text | YES | {MP}-{COLOR}-{FIT}-{SIZE} |
| carton_specs | text | no | 10 pcs per carton, 60x40x40cm |
| shipping_marks | text | no | PO#, colorway, size breakdown per carton |
| special_packaging | text | no | Tissue paper between folds |

**Gate:** PO cannot advance past COSTED without packaging ≥ 80%.

---

### Section 7: CARE & COMPLIANCE
**Purpose:** Legal requirements for the garment.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| country_of_origin | text | YES | China |
| care_instructions | text | YES | Dry clean only |
| fiber_content_label | text | YES | 100% Wool |
| rn_number | text | no | RN12345 |
| care_symbols | text[] | no | [dry-clean, no-bleach, iron-low] |
| flammability | text | no | Not required for menswear outerwear |
| prop65_required | boolean | no | false |

**Gate:** country_of_origin + care_instructions + fiber_content required
before ORDERED.

---

### Section 8: PHOTOGRAPHY & COMMERCE (not blocking PO)
**Purpose:** Marketing and e-commerce assets.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| hero_image | text | no | (synced from Shopify) |
| shot_list | text[] | no | ["front flat", "on model front", "detail lapel"] |
| model_specs | text | no | Size 40R, 6'0", athletic build |
| product_description | text | no | (for Shopify/website) |
| tagline | text | no | "The everyday suit that travels." |

**Gate:** None — this comes after production, before selling.

---

### Section 9: PRICING (required before COSTED)
**Purpose:** Financial parameters for this product.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| fob | numeric | YES | 41.50 |
| duty_pct | numeric | YES | 17.5 |
| hts_code | text | YES | 6203.11.9010 |
| freight_per_unit | numeric | no | 2.50 |
| landed_cost | numeric | computed | FOB × (1 + duty%) + freight |
| retail_price | numeric | YES | 360.00 |
| margin_pct | numeric | computed | (retail - landed) / retail |
| markdown_schedule | json | no | { "after_90_days": 20, "after_180_days": 40 } |

**Gate:** fob + duty + hts + retail required before COSTED.

---

### Section 10: VENDOR (required before ORDERED)
**Purpose:** Who makes this and how.
**Fields:**
| Field | Type | Required | Example |
|-------|------|----------|---------|
| primary_vendor | text | YES | (FK to vendors table) |
| backup_vendor | text | no | |
| lead_time_days | integer | YES | 90 |
| moq | integer | YES | 50 |
| payment_terms | select | YES | standard / 50_50 / 100_upfront |
| vendor_contact | text | no | Mr. Chen, +86... |
| factory_address | text | no | |

**Gate:** primary_vendor + lead_time + moq + payment_terms required before ORDERED.

---

## Completeness Calculation

Each section has a completeness score: required fields filled / total required.
Overall completeness = weighted average across all sections.

**Weights:**
| Section | Weight | Why |
|---------|--------|-----|
| Construction | 25% | Core garment definition |
| Fit & Sizing | 20% | Must be right or everything is wrong |
| Packaging & Labeling | 15% | Factory needs this before production |
| Care & Compliance | 10% | Legal requirement |
| Pricing | 10% | Financial requirement |
| Vendor | 10% | Operational requirement |
| Colorways | 5% | Per-PO, partially flexible |
| Tech Pack | 5% | Required for new, optional for reorder |

Stack is **READY** when overall completeness ≥ 80% AND all critical
sections (Construction, Fit, Pricing, Vendor) are at 100%.

---

## Connection to PO Workflow

| PO Stage | Stack Requirement |
|----------|-------------------|
| CONCEPT | Stack exists for this MP |
| DESIGN | Construction + Fit ≥ 100% |
| SAMPLE | Tech Pack present (new products only) |
| APPROVED | Overall ≥ 80% |
| COSTED | Pricing section complete |
| ORDERED | Packaging + Care + Vendor complete |

If the stack doesn't meet the requirement, the PO stage
advancement button is disabled with a message showing which
sections need to be completed.

---

## Schema Changes

The `product_stack` table already has most of these columns.
What's needed:

1. **Section metadata:** Add a `sections` JSONB column that tracks
   per-section completeness: `{ construction: 100, fit: 75, ... }`
2. **Required field tracking:** The completeness calculation lives
   in the domain layer (lib/product/), not the database.
3. **Gate check:** The PO advanceStage function checks stack
   completeness via the product domain module.

---

## UI Design (for Danny)

The stack editor becomes a **section-based builder**:

1. **Section tabs or accordion** — one section at a time, not all fields visible
2. **Per-section progress bar** — 3/5 required fields filled = 60%
3. **Overall readiness indicator** — "Stack is 73% ready. Gaps: Fit & Sizing needs size_chart."
4. **Required field markers** — red asterisk on required fields
5. **Gate check display** — on PO detail, show which stack sections are blocking advancement
6. **Contextual help** — each field has a tooltip explaining what the factory needs

---

## Implementation Order

1. Peter: This design spec (done)
2. Almond: Add sections JSONB to product_stack, write completeness logic in lib/product/
3. Almond: Wire gate check into PO advanceStage (check stack before advancing)
4. Danny: Rebuild stack editor with section tabs, progress bars, required fields
5. Danny: Show stack gate status on PO detail page
