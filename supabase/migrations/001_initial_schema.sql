-- ═══════════════════════════════════════════════════════════
-- Atica Ops — Supabase Schema
-- Complete database design for 2-year horizon
-- ═══════════════════════════════════════════════════════════

-- ── Enums ─────────────────────────────────────────────────

CREATE TYPE mp_phase AS ENUM (
  'concept', 'brief', 'sourcing', 'sampling', 'sample_review',
  'costing', 'approved', 'po_created', 'production', 'qc',
  'shipping', 'in_store', 'reorder_review', 'end_of_life'
);

CREATE TYPE po_stage AS ENUM (
  'concept', 'design', 'sample', 'approved', 'costed',
  'ordered', 'production', 'qc', 'shipped', 'in_transit',
  'received', 'distribution'
);

CREATE TYPE payment_status AS ENUM (
  'planned', 'upcoming', 'due', 'overdue', 'paid', 'cancelled'
);

CREATE TYPE payment_type AS ENUM (
  'deposit', 'production', 'balance', 'freight', 'duty', 'full'
);

CREATE TYPE demand_signal AS ENUM (
  'hot', 'rising', 'steady', 'slow', 'stockout'
);

CREATE TYPE vendor_tier AS ENUM (
  'strategic', 'preferred', 'standard', 'transactional'
);

CREATE TYPE customer_tier AS ENUM (
  'bronze', 'silver', 'gold', 'platinum', 'diamond'
);

CREATE TYPE gate_type AS ENUM ('pd', 'finance', 'pd_finance');

CREATE TYPE shipment_status AS ENUM (
  'pending', 'booked', 'in_transit', 'at_port', 'customs',
  'cleared', 'delivered'
);

-- ── Master Products ───────────────────────────────────────

CREATE TABLE master_products (
  id TEXT PRIMARY KEY,               -- 'londoner', 'hc360', etc.
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL,
  vendor_id TEXT REFERENCES vendors(id),
  
  -- Pricing
  fob NUMERIC(10,2) DEFAULT 0,
  retail NUMERIC(10,2) DEFAULT 0,
  duty NUMERIC(6,2) DEFAULT 0,
  hts TEXT,
  
  -- Production
  lead_days INTEGER DEFAULT 0,
  moq INTEGER DEFAULT 0,
  country TEXT,
  
  -- Product hierarchy
  sizes TEXT,                        -- size group key: 'dress', 'casual', etc.
  fits TEXT[],                       -- ['Lorenzo 6', 'Lorenzo 4', ...]
  features TEXT[],
  
  -- Lifecycle
  phase mp_phase DEFAULT 'in_store',
  phase_changed_at TIMESTAMPTZ,
  phase_changed_by TEXT,
  
  -- Shopify link
  shopify_product_ids BIGINT[],      -- matched Shopify product IDs
  hero_image TEXT,
  shopify_url TEXT,
  
  -- Velocity (cached, updated by cron)
  velocity_per_week NUMERIC(8,2) DEFAULT 0,
  sell_through NUMERIC(5,2) DEFAULT 0,
  signal demand_signal DEFAULT 'steady',
  total_inventory INTEGER DEFAULT 0,
  days_of_stock INTEGER DEFAULT 999,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Product Stack (Tech Pack Data) ────────────────────────

CREATE TABLE product_stack (
  mp_id TEXT PRIMARY KEY REFERENCES master_products(id) ON DELETE CASCADE,
  
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
  additional_images TEXT[] DEFAULT '{}',
  
  -- Completeness tracking
  completeness INTEGER DEFAULT 0,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vendors ───────────────────────────────────────────────

CREATE TABLE vendors (
  id TEXT PRIMARY KEY,               -- 'tal', 'shandong', etc.
  name TEXT NOT NULL,
  short_name TEXT,
  country TEXT,
  tier vendor_tier DEFAULT 'standard',
  
  -- Performance
  lead_days INTEGER DEFAULT 0,
  moq INTEGER DEFAULT 0,
  on_time_pct NUMERIC(5,2),
  quality_score NUMERIC(5,2),
  
  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Categories they supply
  categories TEXT[],
  
  -- Computed
  total_pos INTEGER DEFAULT 0,
  total_units INTEGER DEFAULT 0,
  total_fob NUMERIC(14,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Purchase Orders ───────────────────────────────────────

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY,               -- 'PO-2603-ABCD'
  
  -- Links
  mp_id TEXT REFERENCES master_products(id),
  vendor_id TEXT REFERENCES vendors(id),
  
  -- Product info (denormalized for speed)
  mp_name TEXT,
  mp_code TEXT,
  category TEXT,
  vendor_name TEXT,
  
  -- Financial
  fob NUMERIC(10,2) DEFAULT 0,
  units INTEGER DEFAULT 0,
  fob_total NUMERIC(14,2) DEFAULT 0,
  landed_cost NUMERIC(10,2),
  moq INTEGER DEFAULT 0,
  lead_days INTEGER DEFAULT 0,
  duty NUMERIC(6,2) DEFAULT 0,
  hts TEXT,
  
  -- Stage system
  stage po_stage DEFAULT 'concept',
  stage_index INTEGER DEFAULT 1,
  
  -- Logistics
  etd DATE,
  eta DATE,
  container TEXT,
  vessel TEXT,
  
  -- Styles/sizing
  styles JSONB DEFAULT '[]',
  sizes TEXT,
  fits JSONB DEFAULT '[]',
  
  -- Check-ins (PD + Finance sign-offs)
  check_ins JSONB DEFAULT '{"pd":[],"fin":[]}',
  
  -- Payment terms
  payment_terms TEXT DEFAULT 'standard',
  
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_mp ON purchase_orders(mp_id);
CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_po_stage ON purchase_orders(stage);
CREATE INDEX idx_po_created ON purchase_orders(created_at DESC);
CREATE INDEX idx_po_active ON purchase_orders(stage) WHERE stage NOT IN ('received', 'distribution');

-- ── PO Payments ───────────────────────────────────────────

CREATE TABLE po_payments (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  type payment_type NOT NULL,
  label TEXT,
  pct NUMERIC(5,2),
  amount NUMERIC(14,2) DEFAULT 0,
  
  due_date DATE,
  status payment_status DEFAULT 'planned',
  
  paid_date DATE,
  paid_amount NUMERIC(14,2),
  paid_reference TEXT,              -- check number, wire ref, etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_po ON po_payments(po_id);
CREATE INDEX idx_payment_due ON po_payments(due_date);
CREATE INDEX idx_payment_status ON po_payments(status);
CREATE INDEX idx_payment_overdue ON po_payments(status, due_date) 
  WHERE status IN ('planned', 'upcoming', 'due');

-- ── Shipments ─────────────────────────────────────────────

CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  
  container TEXT,
  vessel TEXT,
  origin TEXT,
  destination TEXT DEFAULT 'Lakewood',
  
  status shipment_status DEFAULT 'pending',
  
  etd DATE,
  eta DATE,
  arrived_at TIMESTAMPTZ,
  
  -- Customs
  customs_cleared BOOLEAN DEFAULT FALSE,
  duty_paid NUMERIC(12,2),
  broker TEXT,
  
  -- Packing
  carton_count INTEGER,
  total_units INTEGER,
  cbm NUMERIC(8,2),
  weight_kg NUMERIC(8,2),
  
  notes TEXT DEFAULT '',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipment_po ON shipments(po_id);
CREATE INDEX idx_shipment_status ON shipments(status);

-- ── Customers ─────────────────────────────────────────────

CREATE TABLE customers (
  id TEXT PRIMARY KEY,               -- Shopify customer ID
  shopify_id BIGINT UNIQUE,
  
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- Loyalty
  tier customer_tier DEFAULT 'bronze',
  lifetime_value NUMERIC(12,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  
  -- Preferred store
  primary_store TEXT,
  
  -- Sizes
  shirt_size TEXT,
  pants_size TEXT,
  suit_size TEXT,
  shoe_size TEXT,
  
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_shopify ON customers(shopify_id);
CREATE INDEX idx_customer_tier ON customers(tier);
CREATE INDEX idx_customer_store ON customers(primary_store);

-- ── Wholesale Accounts ────────────────────────────────────

CREATE TABLE wholesale_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  city TEXT,
  
  tier TEXT DEFAULT 'standard',
  credit_limit NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) DEFAULT 0,
  terms TEXT DEFAULT 'Net 30',
  discount_pct NUMERIC(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Components / BOM ──────────────────────────────────────

CREATE TABLE components (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                -- fabric, lining, button, zipper, thread, label, packaging
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

CREATE TABLE mp_components (
  mp_id TEXT REFERENCES master_products(id) ON DELETE CASCADE,
  component_id TEXT REFERENCES components(id) ON DELETE CASCADE,
  quantity NUMERIC(8,2) DEFAULT 1,
  notes TEXT,
  PRIMARY KEY (mp_id, component_id)
);

-- ── PLM History ───────────────────────────────────────────

CREATE TABLE plm_history (
  id SERIAL PRIMARY KEY,
  mp_id TEXT NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
  
  from_phase mp_phase,
  to_phase mp_phase NOT NULL,
  
  changed_by TEXT,
  gate_type gate_type,
  notes TEXT,
  
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plm_mp ON plm_history(mp_id);

-- ── PO Stage History ──────────────────────────────────────

CREATE TABLE po_stage_history (
  id SERIAL PRIMARY KEY,
  po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  
  from_stage po_stage,
  to_stage po_stage NOT NULL,
  
  changed_by TEXT,
  gate_type gate_type,
  notes TEXT,
  
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_po_history_po ON po_stage_history(po_id);

-- ── Audit Log ─────────────────────────────────────────────

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  
  entity_type TEXT NOT NULL,         -- 'po', 'mp', 'shipment', 'payment', etc.
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,              -- 'created', 'updated', 'deleted', 'stage_advanced'
  
  changes JSONB,                     -- field-level diff
  performed_by TEXT,
  
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_time ON audit_log(performed_at DESC);

-- ── Campaigns ─────────────────────────────────────────────

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,                         -- 'seasonal', 'clearance', 'launch', etc.
  status TEXT DEFAULT 'planned',     -- planned, active, completed
  
  start_date DATE,
  end_date DATE,
  budget NUMERIC(12,2),
  
  mp_ids TEXT[],                     -- products in this campaign
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── File Attachments ──────────────────────────────────────
-- References to Supabase Storage objects

CREATE TABLE attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  entity_type TEXT NOT NULL,         -- 'mp', 'po', 'shipment', 'qc'
  entity_id TEXT NOT NULL,
  
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,           -- Supabase Storage path
  file_size INTEGER,
  mime_type TEXT,
  
  category TEXT,                     -- 'sample_photo', 'tech_pack', 'qc_report', etc.
  
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachment_entity ON attachments(entity_type, entity_id);

-- ── App Settings ──────────────────────────────────────────

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert defaults
INSERT INTO app_settings (key, value) VALUES
  ('opex_monthly', '25000'),
  ('target_cover_weeks', '20'),
  ('distribution_weights', '{"Lakewood":0.30,"Flatbush":0.20,"Crown Heights":0.15,"Monsey":0.25,"Online":0.10}'),
  ('seasonal_multipliers', '{"1":0.85,"2":0.85,"3":0.85,"4":0.85,"5":0.85,"6":0.85,"7":1.0,"8":1.4,"9":1.4,"10":1.15,"11":1.6,"12":1.6}'),
  ('loyalty_tiers', '{"bronze":{"min":0,"discount":0,"points_mult":1},"silver":{"min":500,"discount":5,"points_mult":1.5},"gold":{"min":1500,"discount":10,"points_mult":2},"platinum":{"min":3000,"discount":15,"points_mult":2.5},"diamond":{"min":5000,"discount":20,"points_mult":3}}')
ON CONFLICT (key) DO NOTHING;

-- ── Views ─────────────────────────────────────────────────

-- Active POs with payment summary
CREATE OR REPLACE VIEW v_active_pos AS
SELECT 
  po.*,
  COALESCE(pmt.total_paid, 0) as total_paid,
  COALESCE(pmt.total_due, 0) as total_due,
  COALESCE(pmt.overdue_count, 0) as overdue_count
FROM purchase_orders po
LEFT JOIN LATERAL (
  SELECT 
    SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total_paid,
    SUM(CASE WHEN status IN ('due', 'overdue') THEN amount ELSE 0 END) as total_due,
    COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
  FROM po_payments WHERE po_id = po.id
) pmt ON TRUE
WHERE po.stage NOT IN ('received', 'distribution');

-- MP health dashboard
CREATE OR REPLACE VIEW v_mp_health AS
SELECT 
  mp.id, mp.name, mp.code, mp.category, mp.phase,
  mp.velocity_per_week, mp.signal, mp.total_inventory, mp.days_of_stock,
  mp.fob, mp.retail,
  COALESCE(po_agg.active_pos, 0) as active_pos,
  COALESCE(po_agg.committed_cost, 0) as committed_cost,
  COALESCE(po_agg.incoming_units, 0) as incoming_units,
  CASE
    WHEN mp.phase::text IN ('concept','brief','sourcing','sampling','sample_review','costing') THEN 'developing'
    WHEN mp.phase = 'approved' AND COALESCE(po_agg.active_pos, 0) = 0 THEN 'ready_to_order'
    WHEN COALESCE(po_agg.active_pos, 0) > 0 AND mp.total_inventory = 0 THEN 'on_order'
    WHEN COALESCE(po_agg.active_pos, 0) > 0 AND mp.total_inventory > 0 THEN 'replenishing'
    WHEN mp.total_inventory > 0 AND mp.days_of_stock > 60 THEN 'in_store'
    WHEN mp.total_inventory > 0 AND mp.days_of_stock <= 60 THEN 'needs_reorder'
    WHEN mp.total_inventory = 0 AND mp.velocity_per_week > 0 THEN 'stockout'
    WHEN mp.phase = 'end_of_life' THEN 'end_of_life'
    ELSE 'unknown'
  END as derived_status
FROM master_products mp
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*) as active_pos,
    SUM(fob_total) as committed_cost,
    SUM(units) as incoming_units
  FROM purchase_orders 
  WHERE mp_id = mp.id AND stage NOT IN ('received', 'distribution')
) po_agg ON TRUE;

-- Cash flow projection data
CREATE OR REPLACE VIEW v_cash_flow AS
SELECT 
  DATE_TRUNC('month', p.due_date) as month,
  SUM(p.amount) as total_due,
  SUM(CASE WHEN p.status = 'paid' THEN p.paid_amount ELSE 0 END) as total_paid,
  SUM(CASE WHEN p.status IN ('due', 'overdue') THEN p.amount ELSE 0 END) as outstanding,
  COUNT(*) as payment_count,
  COUNT(*) FILTER (WHERE p.status = 'overdue') as overdue_count
FROM po_payments p
WHERE p.due_date IS NOT NULL
GROUP BY DATE_TRUNC('month', p.due_date)
ORDER BY month;

-- ── Functions ─────────────────────────────────────────────

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_mp_updated BEFORE UPDATE ON master_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_po_updated BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_vendor_updated BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_shipment_updated BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_customer_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_stack_updated BEFORE UPDATE ON product_stack
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-audit on PO stage change
CREATE OR REPLACE FUNCTION audit_po_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO po_stage_history (po_id, from_stage, to_stage)
    VALUES (NEW.id, OLD.stage, NEW.stage);
    
    INSERT INTO audit_log (entity_type, entity_id, action, changes)
    VALUES ('po', NEW.id, 'stage_advanced', 
      jsonb_build_object('from', OLD.stage::text, 'to', NEW.stage::text));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_po_stage_audit AFTER UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION audit_po_stage_change();

-- Auto-audit on MP phase change
CREATE OR REPLACE FUNCTION audit_mp_phase_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.phase IS DISTINCT FROM NEW.phase THEN
    INSERT INTO plm_history (mp_id, from_phase, to_phase)
    VALUES (NEW.id, OLD.phase, NEW.phase);
    
    INSERT INTO audit_log (entity_type, entity_id, action, changes)
    VALUES ('mp', NEW.id, 'phase_changed',
      jsonb_build_object('from', OLD.phase::text, 'to', NEW.phase::text));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_mp_phase_audit AFTER UPDATE ON master_products
  FOR EACH ROW EXECUTE FUNCTION audit_mp_phase_change();

-- ── Row Level Security ────────────────────────────────────
-- Enable RLS on all tables (policies added when auth is configured)

ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stack ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE components ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Temporary: allow all access (remove when auth is set up)
CREATE POLICY "Allow all" ON master_products FOR ALL USING (true);
CREATE POLICY "Allow all" ON product_stack FOR ALL USING (true);
CREATE POLICY "Allow all" ON vendors FOR ALL USING (true);
CREATE POLICY "Allow all" ON purchase_orders FOR ALL USING (true);
CREATE POLICY "Allow all" ON po_payments FOR ALL USING (true);
CREATE POLICY "Allow all" ON shipments FOR ALL USING (true);
CREATE POLICY "Allow all" ON customers FOR ALL USING (true);
CREATE POLICY "Allow all" ON wholesale_accounts FOR ALL USING (true);
CREATE POLICY "Allow all" ON components FOR ALL USING (true);
CREATE POLICY "Allow all" ON mp_components FOR ALL USING (true);
CREATE POLICY "Allow all" ON campaigns FOR ALL USING (true);
CREATE POLICY "Allow all" ON attachments FOR ALL USING (true);
CREATE POLICY "Allow all" ON audit_log FOR ALL USING (true);
CREATE POLICY "Allow all" ON app_settings FOR ALL USING (true);
