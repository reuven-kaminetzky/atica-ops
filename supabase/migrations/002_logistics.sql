-- Atica Ops — Logistics Tables
-- Run after 001_initial_schema.sql

-- Bin locations in warehouse
CREATE TABLE IF NOT EXISTS bin_locations (
  id TEXT PRIMARY KEY,               -- 'A-01-03' (aisle-rack-shelf)
  zone TEXT NOT NULL DEFAULT 'storage', -- receiving, storage, picking, staging, returns
  sku TEXT,                          -- current SKU in this bin (null = empty)
  mp_id TEXT,                        -- master product ID
  current_qty INTEGER DEFAULT 0,
  max_qty INTEGER DEFAULT 100,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bin_zone ON bin_locations(zone);
CREATE INDEX IF NOT EXISTS idx_bin_sku ON bin_locations(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bin_mp ON bin_locations(mp_id) WHERE mp_id IS NOT NULL;

-- Transfers between locations
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,               -- 'TR-0327-ABCD'
  from_location TEXT NOT NULL,       -- 'Reserve', bin ID, or store name
  to_location TEXT NOT NULL,         -- 'Lakewood', 'Flatbush', etc.
  status TEXT NOT NULL DEFAULT 'planned', -- planned → picked → loaded → in_transit → delivered → confirmed
  items JSONB NOT NULL DEFAULT '[]', -- [{mpId, mpName, sku, qty}]
  total_units INTEGER DEFAULT 0,
  van_route_id TEXT,                 -- link to van_routes
  
  -- People
  created_by TEXT,
  picked_by TEXT,
  confirmed_by TEXT,
  
  -- Timestamps
  picked_at TIMESTAMPTZ,
  loaded_at TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_status ON transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfer_to ON transfers(to_location);
CREATE INDEX IF NOT EXISTS idx_transfer_from ON transfers(from_location);
CREATE INDEX IF NOT EXISTS idx_transfer_van ON transfers(van_route_id) WHERE van_route_id IS NOT NULL;

-- Van delivery routes
CREATE TABLE IF NOT EXISTS van_routes (
  id TEXT PRIMARY KEY,               -- 'VR-2603-AM'
  route_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned', -- planned → loading → departed → completed
  driver TEXT,
  stops JSONB NOT NULL DEFAULT '[]', -- [{store, transferIds, eta, arrivedAt, confirmedAt, notes}]
  
  total_units INTEGER DEFAULT 0,
  total_transfers INTEGER DEFAULT 0,
  
  departed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_van_date ON van_routes(route_date);
CREATE INDEX IF NOT EXISTS idx_van_status ON van_routes(status);

-- Receiving log (packing list verification)
CREATE TABLE IF NOT EXISTS receiving_log (
  id TEXT PRIMARY KEY DEFAULT 'RCV-' || substr(md5(random()::text), 1, 8),
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  
  expected_items JSONB DEFAULT '[]', -- [{sku, mpId, mpName, qty}]
  received_items JSONB DEFAULT '[]', -- [{sku, mpId, mpName, qty, binId}]
  discrepancies JSONB DEFAULT '[]',  -- [{sku, expected, received, type, note}]
  
  status TEXT NOT NULL DEFAULT 'pending', -- pending → in_progress → complete → disputed
  received_by TEXT,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receiving_status ON receiving_log(status);
CREATE INDEX IF NOT EXISTS idx_receiving_po ON receiving_log(po_id);
CREATE INDEX IF NOT EXISTS idx_receiving_shipment ON receiving_log(shipment_id);

-- Auto-update timestamps
DROP TRIGGER IF EXISTS tr_bin_updated ON bin_locations;
CREATE TRIGGER tr_bin_updated BEFORE UPDATE ON bin_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS tr_transfer_updated ON transfers;
CREATE TRIGGER tr_transfer_updated BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS tr_van_updated ON van_routes;
CREATE TRIGGER tr_van_updated BEFORE UPDATE ON van_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
