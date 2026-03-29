-- Atica Ops — Styles Table
-- Each Shopify product = one style (colorway) under a Master Product
-- This is the missing level: MP → Style → Fit → Size → Length → SKU

CREATE TABLE IF NOT EXISTS styles (
  id TEXT PRIMARY KEY,                   -- shopify product ID as string
  mp_id TEXT NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
  shopify_product_id BIGINT,             -- Shopify product.id
  title TEXT NOT NULL,                   -- full Shopify title
  colorway TEXT,                         -- extracted color name (Navy, Charcoal, etc)
  color_group TEXT,                      -- color family for cross-MP analysis
  grade TEXT DEFAULT 'B',                -- A/B/C/D — how core this style is
  hero_image TEXT,                       -- Shopify image URL
  retail NUMERIC(10,2) DEFAULT 0,        -- max variant price
  inventory INTEGER DEFAULT 0,           -- sum of variant inventory_quantity
  variant_count INTEGER DEFAULT 0,       -- number of variants (fits × sizes)
  status TEXT DEFAULT 'active',          -- active, discontinued, seasonal, archived
  shopify_handle TEXT,                   -- URL slug
  shopify_tags TEXT[],                   -- Shopify tags array
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_style_mp ON styles(mp_id);
CREATE INDEX IF NOT EXISTS idx_style_shopify ON styles(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_style_grade ON styles(grade);
CREATE INDEX IF NOT EXISTS idx_style_status ON styles(status);
CREATE INDEX IF NOT EXISTS idx_style_color_group ON styles(color_group) WHERE color_group IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS tr_style_updated ON styles;
CREATE TRIGGER tr_style_updated BEFORE UPDATE ON styles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
