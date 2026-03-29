-- Migration 012: Sprint 0 + Sprint 1 Foundation
-- From senior developer remediation audit.
-- See docs/SPRINT_PLAN.html for full context.

-- ══ Webhook Deduplication ═══════════════════════════════
-- Shopify can fire the same webhook multiple times.
-- Log every webhook, skip duplicates via unique index.

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'shopify',
  topic TEXT NOT NULL,
  external_id TEXT,
  payload JSONB,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_dedup
  ON webhook_events(source, external_id)
  WHERE external_id IS NOT NULL;

-- ══ Convert Remaining ENUMs to TEXT ═════════════════════
-- po_stage already converted in migration 011.
-- Converting all others so we never need ALTER TYPE again.

ALTER TABLE po_payments ALTER COLUMN status TYPE TEXT USING status::TEXT;
ALTER TABLE po_payments ALTER COLUMN status SET DEFAULT 'planned';
ALTER TABLE po_payments ALTER COLUMN type TYPE TEXT USING type::TEXT;

ALTER TABLE master_products ALTER COLUMN phase TYPE TEXT USING phase::TEXT;
ALTER TABLE master_products ALTER COLUMN phase SET DEFAULT 'in_store';
ALTER TABLE master_products ALTER COLUMN signal TYPE TEXT USING signal::TEXT;
ALTER TABLE master_products ALTER COLUMN signal SET DEFAULT 'steady';

ALTER TABLE vendors ALTER COLUMN tier TYPE TEXT USING tier::TEXT;
ALTER TABLE vendors ALTER COLUMN tier SET DEFAULT 'standard';

ALTER TABLE customers ALTER COLUMN tier TYPE TEXT USING tier::TEXT;
ALTER TABLE customers ALTER COLUMN tier SET DEFAULT 'bronze';

ALTER TABLE shipments ALTER COLUMN status TYPE TEXT USING status::TEXT;
ALTER TABLE shipments ALTER COLUMN status SET DEFAULT 'pending';

-- po_stage_history references po_stage enum
ALTER TABLE po_stage_history ALTER COLUMN from_stage TYPE TEXT USING from_stage::TEXT;
ALTER TABLE po_stage_history ALTER COLUMN to_stage TYPE TEXT USING to_stage::TEXT;

-- plm_history references mp_phase enum
ALTER TABLE plm_history ALTER COLUMN from_phase TYPE TEXT USING from_phase::TEXT;
ALTER TABLE plm_history ALTER COLUMN to_phase TYPE TEXT USING to_phase::TEXT;

-- Drop the gate_type enum usage
ALTER TABLE plm_history ALTER COLUMN gate_type TYPE TEXT USING gate_type::TEXT;
ALTER TABLE po_stage_history ALTER COLUMN gate_type TYPE TEXT USING gate_type::TEXT;

-- ══ Locations Table ═════════════════════════════════════
-- Proper location entity with Shopify ID mapping.
-- Required by event-sourced inventory (Sprint 2).

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'store',
  manager TEXT,
  shopify_location_id BIGINT UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed known locations (Shopify IDs to be filled by Bonney after lookup)
INSERT INTO locations (name, code, type) VALUES
  ('Lakewood', 'LKW', 'store'),
  ('Flatbush', 'FLT', 'store'),
  ('Crown Heights', 'CRH', 'store'),
  ('Monsey', 'MNS', 'store'),
  ('Online', 'ONL', 'store'),
  ('Reserve', 'WH', 'warehouse')
ON CONFLICT (code) DO NOTHING;

-- ══ SKUs Table (Sprint 1) ═══════════════════════════════
-- The missing hierarchy level. Variant decomposition.
-- Style → SKU → inventory_events

CREATE TABLE IF NOT EXISTS skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id TEXT NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  mp_id TEXT REFERENCES master_products(id) ON DELETE SET NULL,
  fit TEXT,
  size TEXT NOT NULL,
  length TEXT,
  sku_code TEXT,
  barcode TEXT,
  shopify_variant_id BIGINT UNIQUE,
  shopify_inventory_item_id BIGINT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skus_style ON skus(style_id);
CREATE INDEX IF NOT EXISTS idx_skus_mp ON skus(mp_id);
CREATE INDEX IF NOT EXISTS idx_skus_variant ON skus(shopify_variant_id);
CREATE INDEX IF NOT EXISTS idx_skus_fit ON skus(fit) WHERE fit IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_skus_size ON skus(size);

-- Link sales to SKUs
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sku_id UUID REFERENCES skus(id);
CREATE INDEX IF NOT EXISTS idx_sales_sku ON sales(sku_id) WHERE sku_id IS NOT NULL;

-- ══ Inventory Events (Sprint 2 Foundation) ═══════════════
-- Event-sourced inventory. Current stock = SUM(events).
-- Every inventory change is an auditable event.

CREATE TABLE IF NOT EXISTS inventory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES skus(id),
  location_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  quantity INT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_events_sku ON inventory_events(sku_id);
CREATE INDEX IF NOT EXISTS idx_inv_events_loc ON inventory_events(sku_id, location_code);
CREATE INDEX IF NOT EXISTS idx_inv_events_ref ON inventory_events(reference_type, reference_id);

-- Materialized view for fast reads
CREATE MATERIALIZED VIEW IF NOT EXISTS inventory_levels AS
SELECT sku_id, location_code,
  SUM(quantity) AS on_hand,
  MAX(created_at) AS last_movement
FROM inventory_events
GROUP BY sku_id, location_code
HAVING SUM(quantity) != 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_levels
  ON inventory_levels(sku_id, location_code);

-- ══ Orders Table (Sprint 3 Foundation) ══════════════════
-- Proper order-level data. sales table becomes order_lines.

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  shopify_order_id BIGINT UNIQUE,
  order_number TEXT,
  channel TEXT DEFAULT 'retail',
  location_code TEXT,
  customer_id TEXT REFERENCES customers(id),
  subtotal NUMERIC(10,2),
  tax NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2),
  item_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  ordered_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_shopify ON orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(location_code);

-- Link sales (order_lines) to orders
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_ref TEXT REFERENCES orders(id);
