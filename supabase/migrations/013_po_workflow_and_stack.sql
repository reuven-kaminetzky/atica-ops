-- Migration 013: PO Workflow Engine + Product Stack Builder
-- Adds stage-specific columns to purchase_orders
-- Adds sections JSONB to product_stack for per-section completeness
-- See docs/PO_WORKFLOW_ENGINE.md and docs/PRODUCT_STACK_BUILDER.md

-- ══ PO Stage-Specific Columns ══════════════════════════

-- Design stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS is_reorder BOOLEAN DEFAULT false;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS design_confirmed_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS design_confirmed_at TIMESTAMPTZ;

-- Sample stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sample_requested_at DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sample_received_at DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sample_images TEXT[] DEFAULT '{}';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sample_notes TEXT DEFAULT '';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sample_approved BOOLEAN DEFAULT false;

-- Approved stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Costed stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS costed_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS costed_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(6,2);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS margin_override_reason TEXT;

-- Ordered stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pi_reference TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ;

-- Production stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS production_started_at DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS production_expected_at DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS inline_inspection_date DATE;

-- QC stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qc_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qc_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qc_report_url TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qc_defect_rate NUMERIC(5,2);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qc_passed BOOLEAN;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qc_override_reason TEXT;

-- Received stage
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS count_variance INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS damage_notes TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by TEXT;

-- Deadline tracking
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS target_delivery_date DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS current_deadline DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN DEFAULT false;

-- ══ Product Stack Sections ═════════════════════════════

-- Per-section completeness tracking
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '{}';

-- Structured fields for Construction section
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS construction_method TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS fabric_composition TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS lining_type TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS button_style TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS shoulder_type TEXT;

-- Fit & Sizing
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS fit_model TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS size_range TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS length_options TEXT[];

-- Packaging & Labeling
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS garment_bag TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS hanger_type TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS tag_placement TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS barcode_format TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS sku_pattern TEXT;

-- Care & Compliance
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS country_of_origin TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS care_instructions TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS fiber_content_label TEXT;

-- Tech Pack
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS tech_pack_url TEXT;
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS tech_pack_version TEXT;

-- Pricing (mostly on MP already, but margin schedule on stack)
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS markdown_schedule JSONB;

-- Vendor
ALTER TABLE product_stack ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- Vendor scoring support
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS score_cache JSONB DEFAULT '{}';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS communication_rating INTEGER DEFAULT 3;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS preferred_terms TEXT DEFAULT 'standard';
