-- Atica Ops — Source-agnostic schema
-- Renames Shopify-specific columns to generic external_* names
-- so QuickBooks, Amazon, RFID can plug in without schema changes

-- master_products: shopify_product_ids → external_ids
ALTER TABLE master_products RENAME COLUMN shopify_product_ids TO external_ids;
ALTER TABLE master_products RENAME COLUMN shopify_url TO external_url;
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'shopify';

-- styles: shopify_* → generic names  
ALTER TABLE styles RENAME COLUMN shopify_product_id TO external_product_id;
ALTER TABLE styles RENAME COLUMN shopify_handle TO external_handle;
ALTER TABLE styles RENAME COLUMN shopify_tags TO tags;
ALTER TABLE styles ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'shopify';

-- Drop old indexes, create new ones with generic names
DROP INDEX IF EXISTS idx_style_shopify;
CREATE INDEX IF NOT EXISTS idx_style_external ON styles(external_product_id);

-- customers
ALTER TABLE customers RENAME COLUMN shopify_id TO external_id;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'shopify';

-- External connections registry
CREATE TABLE IF NOT EXISTS external_connections (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  last_sync TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- External event queue (for async processing)
CREATE TABLE IF NOT EXISTS external_events (
  id SERIAL PRIMARY KEY,
  connection_id TEXT REFERENCES external_connections(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_events_unprocessed ON external_events(processed) WHERE processed = FALSE;
