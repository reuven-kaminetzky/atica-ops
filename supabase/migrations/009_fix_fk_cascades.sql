-- Atica Ops — Fix FK cascades
-- purchase_orders.mp_id and sales.mp_id were missing ON DELETE CASCADE,
-- causing seed failures when master_products rows are replaced.
-- purchase_orders.vendor_id also needs CASCADE for vendor re-seeding.

-- purchase_orders.mp_id
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_mp_id_fkey;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_mp_id_fkey
  FOREIGN KEY (mp_id) REFERENCES master_products(id) ON DELETE SET NULL;

-- purchase_orders.vendor_id
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_vendor_id_fkey;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- sales.mp_id
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_mp_id_fkey;
ALTER TABLE sales ADD CONSTRAINT sales_mp_id_fkey
  FOREIGN KEY (mp_id) REFERENCES master_products(id) ON DELETE SET NULL;
