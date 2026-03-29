-- Migration 011: Architectural Envelope
-- Creates tables/columns for patterns we'll need at $11M+
-- No feature code needed — just the schema foundation.
-- See docs/ARCHITECTURAL_ENVELOPE.md for rationale.

-- ══ Documents ═══════════════════════════════════════════
-- Attach files (photos, reports, tech packs) to any entity
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY DEFAULT 'doc-' || substr(md5(random()::text), 1, 8),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_entity ON documents(entity_type, entity_id);

-- ══ Users ═══════════════════════════════════════════════
-- Schema ready for when staff needs access
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  stores TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  pin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══ Channels ════════════════════════════════════════════
ALTER TABLE sales ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'retail';
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2);
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS wholesale_moq INTEGER DEFAULT 12;

-- ══ Alerts ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  message TEXT,
  action_url TEXT,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_unack ON alerts(acknowledged) WHERE acknowledged = false;

-- ══ Configurable Workflows ══════════════════════════════
-- Move PO stage from ENUM to TEXT so stages can change without migrations
ALTER TABLE purchase_orders ALTER COLUMN stage TYPE TEXT USING stage::TEXT;
ALTER TABLE purchase_orders ALTER COLUMN stage SET DEFAULT 'concept';

-- ══ Collections (seasonal grouping) ════════════════════
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT,
  year INTEGER,
  target_ship_date DATE,
  status TEXT DEFAULT 'planning',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS collection_id TEXT REFERENCES collections(id);

-- ══ Returns ═════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  order_id TEXT,
  style_id TEXT,
  mp_id TEXT,
  store TEXT,
  quantity INTEGER DEFAULT 1,
  reason TEXT,
  condition TEXT,
  refund_amount NUMERIC(10,2),
  action TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  processed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_returns_mp ON returns(mp_id);
CREATE INDEX IF NOT EXISTS idx_returns_store ON returns(store);
