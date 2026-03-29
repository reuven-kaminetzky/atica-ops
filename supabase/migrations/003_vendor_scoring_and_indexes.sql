-- Atica Ops — Vendor Scoring + Terms
-- Run after 002_logistics.sql

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS preferred_terms TEXT DEFAULT 'standard';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS on_time_pct NUMERIC(5,2);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS avg_lead_days INTEGER;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS quality_score NUMERIC(3,2);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS total_pos INTEGER DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS total_units INTEGER DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS total_committed NUMERIC(12,2) DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS last_po_date TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Atica Ops — Performance Indexes
-- Run after 001 + 002

-- Products
CREATE INDEX IF NOT EXISTS idx_mp_category ON master_products(category);
CREATE INDEX IF NOT EXISTS idx_mp_vendor ON master_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_mp_phase ON master_products(phase);
CREATE INDEX IF NOT EXISTS idx_mp_signal ON master_products(signal);

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_po_stage ON purchase_orders(stage);
CREATE INDEX IF NOT EXISTS idx_po_created ON purchase_orders(created_at DESC);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payment_status ON po_payments(status);
CREATE INDEX IF NOT EXISTS idx_payment_due ON po_payments(due_date) WHERE status IN ('planned', 'upcoming', 'due');

-- Audit
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(performed_at DESC);

-- Shipments
CREATE INDEX IF NOT EXISTS idx_shipment_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipment_po ON shipments(po_id);
