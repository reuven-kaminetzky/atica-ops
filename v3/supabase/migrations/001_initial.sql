-- Atica Ops v3 — Initial Schema
-- Supabase Postgres
-- Run: supabase db push

-- ════════════════════════════════════════════════════════
-- ENUM TYPES
-- ════════════════════════════════════════════════════════

CREATE TYPE po_stage AS ENUM (
  'Concept', 'Design', 'Sample', 'Approved', 'Costed',
  'Ordered', 'Production', 'QC', 'Shipped', 'In Transit',
  'Received', 'Distribution'
);

CREATE TYPE mp_phase AS ENUM (
  'Concept', 'Brief', 'Sourcing', 'Sampling', 'Sample Review',
  'Costing', 'Approved', 'PO Created', 'Production', 'QC',
  'Shipping', 'In-Store', 'Reorder Review', 'End of Life'
);

CREATE TYPE payment_status AS ENUM (
  'planned', 'upcoming', 'due', 'overdue', 'paid'
);

CREATE TYPE payment_type AS ENUM (
  'deposit', 'production', 'balance', 'freight', 'duty', 'full'
);

CREATE TYPE user_role AS ENUM (
  'admin', 'buyer', 'finance', 'pd', 'sales', 'ops'
);

CREATE TYPE vendor_tier AS ENUM (
  'strategic', 'preferred', 'standard', 'transactional'
);

CREATE TYPE demand_signal AS ENUM (
  'hot', 'rising', 'steady', 'slow', 'stockout'
);

-- ════════════════════════════════════════════════════════
-- CORE TABLES
-- ════════════════════════════════════════════════════════

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role user_role DEFAULT 'sales',
  store TEXT,  -- assigned store location
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,
  mp_id TEXT NOT NULL,
  mp_name TEXT,
  mp_code TEXT,
  category TEXT,
  vendor TEXT NOT NULL,
  fob NUMERIC(10,2) DEFAULT 0,
  units INTEGER DEFAULT 0,
  fob_total NUMERIC(12,2) GENERATED ALWAYS AS (fob * units) STORED,
  landed_cost NUMERIC(10,2),
  moq INTEGER DEFAULT 0,
  lead_days INTEGER DEFAULT 0,
  hts TEXT,
  duty_pct NUMERIC(6,2) DEFAULT 0,
  stage po_stage DEFAULT 'Concept',
  etd DATE,
  eta DATE,
  container TEXT,
  vessel TEXT,
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  styles JSONB DEFAULT '[]',
  sizes TEXT,
  fits JSONB DEFAULT '[]',
  check_ins JSONB DEFAULT '{"pd":[],"fin":[]}',
  payment_terms TEXT DEFAULT 'standard',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_mp ON purchase_orders(mp_id);
CREATE INDEX idx_po_vendor ON purchase_orders(vendor);
CREATE INDEX idx_po_stage ON purchase_orders(stage);
CREATE INDEX idx_po_created ON purchase_orders(created_at DESC);
CREATE INDEX idx_po_etd ON purchase_orders(etd) WHERE etd IS NOT NULL;

-- PO Payments
CREATE TABLE po_payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  type payment_type NOT NULL,
  label TEXT,
  pct NUMERIC(5,2),
  amount NUMERIC(12,2) DEFAULT 0,
  due_date DATE,
  status payment_status DEFAULT 'planned',
  paid_date DATE,
  paid_amount NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_po ON po_payments(po_id);
CREATE INDEX idx_payment_status ON po_payments(status);
CREATE INDEX idx_payment_due ON po_payments(due_date) WHERE due_date IS NOT NULL;

-- Shipments
CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  mp_id TEXT,
  product_name TEXT,
  container TEXT,
  vessel TEXT,
  origin TEXT,
  status TEXT DEFAULT 'pending',
  etd DATE,
  eta DATE,
  arrived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipment_po ON shipments(po_id);
CREATE INDEX idx_shipment_status ON shipments(status);

-- PLM Stages (MP lifecycle tracking)
CREATE TABLE plm_stages (
  mp_id TEXT PRIMARY KEY,
  phase mp_phase DEFAULT 'Concept',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  history JSONB DEFAULT '[]'
);

-- Product Stack (tech pack data per MP)
CREATE TABLE product_stack (
  mp_id TEXT PRIMARY KEY,
  -- Materials
  fabric_type TEXT DEFAULT '',
  fabric_weight TEXT DEFAULT '',
  fabric_comp TEXT DEFAULT '',
  fabric_mill TEXT DEFAULT '',
  colorways JSONB DEFAULT '[]',
  wash_care TEXT DEFAULT '',
  -- Construction
  seams TEXT DEFAULT '',
  stitching TEXT DEFAULT '',
  buttons TEXT DEFAULT '',
  zippers TEXT DEFAULT '',
  lining TEXT DEFAULT '',
  interlining TEXT DEFAULT '',
  labels TEXT DEFAULT '',
  packaging TEXT DEFAULT '',
  -- Sizing
  size_chart JSONB,
  grading JSONB,
  fit_notes TEXT DEFAULT '',
  tolerances TEXT DEFAULT '',
  measurement_points JSONB DEFAULT '[]',
  -- Quality
  aql_level TEXT DEFAULT '2.5',
  qc_checklist JSONB DEFAULT '[]',
  test_reports JSONB DEFAULT '[]',
  -- Logistics
  packing_instructions TEXT DEFAULT '',
  label_requirements TEXT DEFAULT '',
  shipping_marks TEXT DEFAULT '',
  carton_specs TEXT DEFAULT '',
  -- Compliance
  country_of_origin TEXT DEFAULT '',
  care_labels TEXT DEFAULT '',
  hang_tags TEXT DEFAULT '',
  -- Content
  description TEXT DEFAULT '',
  tagline TEXT DEFAULT '',
  features JSONB DEFAULT '[]',
  hero_image TEXT,
  additional_images JSONB DEFAULT '[]',
  -- Meta
  history JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- NEW TABLES (not in v2)
-- ════════════════════════════════════════════════════════

-- Vendors
CREATE TABLE vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  country TEXT,
  tier vendor_tier DEFAULT 'standard',
  lead_days INTEGER,
  moq INTEGER,
  on_time_pct NUMERIC(5,2),
  quality_score NUMERIC(5,2),
  categories TEXT[] DEFAULT '{}',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wholesale Accounts
CREATE TABLE wholesale_accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  tier TEXT DEFAULT 'standard',
  credit_limit NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) DEFAULT 0,
  terms TEXT DEFAULT 'net30',
  discount_pct NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Components / BOM
CREATE TABLE components (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL,  -- fabric, lining, button, zipper, thread, label, packaging
  name TEXT NOT NULL,
  vendor TEXT,
  composition TEXT,
  weight TEXT,
  width TEXT,
  cost NUMERIC(10,2),
  mill TEXT,
  lead_days INTEGER,
  moq INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MP ↔ Component link (BOM)
CREATE TABLE mp_components (
  mp_id TEXT NOT NULL,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  quantity NUMERIC(10,2) DEFAULT 1,
  notes TEXT DEFAULT '',
  PRIMARY KEY (mp_id, component_id)
);

-- Campaigns
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  type TEXT,
  status TEXT DEFAULT 'planned',
  start_date DATE,
  end_date DATE,
  budget NUMERIC(12,2),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changes JSONB,
  performed_by UUID REFERENCES profiles(id),
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_time ON audit_log(performed_at DESC);

-- File attachments (metadata — actual files in Supabase Storage)
CREATE TABLE attachments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type TEXT NOT NULL,  -- 'po', 'mp', 'shipment', 'qc'
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,    -- Supabase Storage path
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachment_entity ON attachments(entity_type, entity_id);

-- ════════════════════════════════════════════════════════
-- FUNCTIONS + TRIGGERS
-- ════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER po_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER shipment_updated_at BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vendor_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER wholesale_updated_at BEFORE UPDATE ON wholesale_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER stack_updated_at BEFORE UPDATE ON product_stack
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-audit PO stage changes
CREATE OR REPLACE FUNCTION audit_po_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO audit_log (entity_type, entity_id, action, changes)
    VALUES ('po', NEW.id, 'stage_changed', jsonb_build_object(
      'from', OLD.stage::text,
      'to', NEW.stage::text,
      'at', NOW()
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER po_stage_audit AFTER UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION audit_po_stage_change();

-- Payment status auto-refresh (call via pg_cron)
CREATE OR REPLACE FUNCTION refresh_payment_statuses()
RETURNS void AS $$
BEGIN
  -- Planned → upcoming (within 14 days)
  UPDATE po_payments SET status = 'upcoming'
  WHERE status = 'planned' AND due_date <= CURRENT_DATE + INTERVAL '14 days';

  -- Upcoming → due (within 3 days)
  UPDATE po_payments SET status = 'due'
  WHERE status IN ('planned', 'upcoming') AND due_date <= CURRENT_DATE + INTERVAL '3 days';

  -- Due → overdue (past due)
  UPDATE po_payments SET status = 'overdue'
  WHERE status IN ('planned', 'upcoming', 'due') AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════
-- VIEWS (common queries as views)
-- ════════════════════════════════════════════════════════

-- Active POs with payment totals
CREATE OR REPLACE VIEW active_pos AS
SELECT
  po.*,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0) AS paid_total,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status != 'paid'), 0) AS unpaid_total,
  COUNT(p.id) FILTER (WHERE p.status = 'overdue') AS overdue_count
FROM purchase_orders po
LEFT JOIN po_payments p ON p.po_id = po.id
WHERE po.stage NOT IN ('Received', 'Distribution')
GROUP BY po.id;

-- Cash flow: upcoming payments by month
CREATE OR REPLACE VIEW monthly_payments AS
SELECT
  date_trunc('month', due_date) AS month,
  SUM(amount) FILTER (WHERE status != 'paid') AS projected,
  SUM(paid_amount) FILTER (WHERE status = 'paid') AS actual,
  COUNT(*) AS payment_count
FROM po_payments
WHERE due_date IS NOT NULL
GROUP BY date_trunc('month', due_date)
ORDER BY month;

-- MP status overview (PO counts + stages)
CREATE OR REPLACE VIEW mp_po_summary AS
SELECT
  mp_id,
  COUNT(*) AS total_pos,
  COUNT(*) FILTER (WHERE stage NOT IN ('Received', 'Distribution')) AS active_pos,
  SUM(fob_total) AS total_committed,
  SUM(units) AS total_units,
  array_agg(DISTINCT stage::text) AS stages
FROM purchase_orders
GROUP BY mp_id;
