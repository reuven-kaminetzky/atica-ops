-- Atica Ops — Store Inventory + Sales History
-- These are the two critical gaps in the data model.
-- Without them, we can't answer "what's selling where" without
-- hitting the Shopify API every time.

-- Per-store, per-style stock levels
-- Source: Shopify inventory per location
-- Updated by: sync (full pull) and webhooks (incremental)
CREATE TABLE IF NOT EXISTS store_inventory (
  id SERIAL PRIMARY KEY,
  style_id TEXT REFERENCES styles(id) ON DELETE CASCADE,
  mp_id TEXT REFERENCES master_products(id) ON DELETE CASCADE,
  location TEXT NOT NULL,             -- Lakewood, Flatbush, Crown Heights, Monsey, Online, Reserve
  location_id BIGINT,                 -- Shopify location ID
  quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(style_id, location)
);

CREATE INDEX IF NOT EXISTS idx_store_inv_mp ON store_inventory(mp_id);
CREATE INDEX IF NOT EXISTS idx_store_inv_location ON store_inventory(location);
CREATE INDEX IF NOT EXISTS idx_store_inv_style ON store_inventory(style_id);

-- Sales history (denormalized from Shopify orders)
-- One row per line item, not per order. This is what velocity is computed from.
-- Source: Shopify orders API (initial sync) and order webhooks (ongoing)
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,             -- Shopify order name (#1234)
  order_shopify_id BIGINT,            -- Shopify order ID
  ordered_at TIMESTAMPTZ NOT NULL,    -- when the sale happened
  store TEXT,                         -- POS location or 'Online'
  mp_id TEXT REFERENCES master_products(id),
  style_id TEXT,                      -- FK to styles if resolvable
  sku TEXT,
  title TEXT,                         -- product title at time of sale
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2),           -- price per unit
  total NUMERIC(10,2),                -- quantity × unit_price
  customer_name TEXT,
  source TEXT DEFAULT 'shopify',      -- shopify, manual, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_mp ON sales(mp_id);
CREATE INDEX IF NOT EXISTS idx_sales_ordered ON sales(ordered_at);
CREATE INDEX IF NOT EXISTS idx_sales_store ON sales(store);
CREATE INDEX IF NOT EXISTS idx_sales_order ON sales(order_id);

-- Velocity view: units per week per MP, computed from sales table
CREATE OR REPLACE VIEW v_velocity AS
SELECT 
  mp_id,
  COUNT(*)::int AS total_units,
  SUM(total)::numeric AS total_revenue,
  ROUND(COUNT(*)::numeric / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(ordered_at))) / 604800, 1), 2) AS units_per_week,
  COUNT(DISTINCT store) AS store_count,
  MIN(ordered_at) AS first_sale,
  MAX(ordered_at) AS last_sale
FROM sales
WHERE ordered_at > NOW() - INTERVAL '30 days'
GROUP BY mp_id;

-- Store performance view
CREATE OR REPLACE VIEW v_store_performance AS
SELECT
  store,
  COUNT(*)::int AS units,
  SUM(total)::numeric AS revenue,
  COUNT(DISTINCT order_id)::int AS orders,
  ROUND(SUM(total) / NULLIF(COUNT(DISTINCT order_id), 0), 2) AS avg_order
FROM sales
WHERE ordered_at > NOW() - INTERVAL '30 days'
GROUP BY store;
