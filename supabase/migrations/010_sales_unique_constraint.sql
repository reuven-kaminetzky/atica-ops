-- Prevent duplicate sales when sync runs multiple times.
-- Without this, ON CONFLICT DO NOTHING has no conflict to detect.

DELETE FROM sales a USING sales b
WHERE a.id > b.id 
  AND a.order_shopify_id = b.order_shopify_id 
  AND COALESCE(a.sku, a.title, '') = COALESCE(b.sku, b.title, '')
  AND a.order_shopify_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_dedup 
  ON sales (order_shopify_id, COALESCE(sku, title, ''));
