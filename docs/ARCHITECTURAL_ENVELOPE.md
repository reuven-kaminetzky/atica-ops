# Architectural Envelope — Patterns for $17M

## The Principle

Don't build features you don't need yet. But make sure the PATTERNS
are in place so that when you need those features, adding them is
a one-sprint bolt-on, not a rebuild.

Six patterns. Each one enables a cluster of future features.
Some require schema changes now. Some just need the right columns
on existing tables. None require building the full feature yet.

---

## Pattern 1: Event Log (the spine of everything)

### What We Have
`audit_log` table exists. Used in 3 places (PO create, PO advance, 
PO delete). No reads. Nobody consumes it.

### What It Should Be
Every meaningful action in the system produces an event. Events are
the source of truth for: notifications, audit trail, analytics,
undo/redo, activity feeds, and debugging.

### Schema (already exists — just needs consistency)
```sql
-- audit_log is fine as-is:
--   entity_type TEXT  ('purchase_order', 'master_product', 'style', 'payment')
--   entity_id TEXT    (the PO ID, MP ID, etc.)
--   action TEXT       ('created', 'stage_advanced', 'payment_made', 'stock_received')
--   changes JSONB     ({ from: 'concept', to: 'design', fields: {...} })
--   performed_by TEXT ('system', 'bonney-sync', 'reuven')
--   performed_at TIMESTAMPTZ
```

### What Changes Now
Every DAL write method must emit an event. Not some. ALL.
- PO created → event
- PO stage advanced → event (already done)
- Payment recorded → event
- Stock received → event
- Sale recorded → event (during sync)
- Grade changed → event
- Price changed → event
- Transfer created → event

### What This Enables Later
- **Activity feed:** "3 hours ago: PO-0329-ABCD advanced to Shipped"
- **Notifications:** "Payment overdue on PO-0329-ABCD" (triggered by event)
- **Undo:** Reverse the last action using the `changes` JSONB
- **User attribution:** Who did what (when users exist)
- **Compliance:** Full audit trail for accountant

### Owner: Almond
### Priority: Add events to every DAL write. 1 line per write method.

---

## Pattern 2: Documents & Files

### What We Have
Nothing. Sample photos, QC reports, tech packs, invoices — nowhere
to store them. `product_stack.additional_images TEXT[]` is the only
file field, and it's never populated.

### What It Should Be
Any entity can have attached documents. Documents have types,
metadata, and storage references.

### Schema (add now, build UI later)
```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,     -- 'purchase_order', 'master_product', 'vendor'
  entity_id TEXT NOT NULL,       -- the PO ID, MP ID, etc.
  doc_type TEXT NOT NULL,        -- 'sample_photo', 'qc_report', 'tech_pack',
                                 -- 'invoice', 'packing_list', 'lab_dip'
  filename TEXT NOT NULL,
  url TEXT NOT NULL,             -- storage URL (Netlify Blobs, S3, or Cloudflare R2)
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doc_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_doc_type ON documents(doc_type);
```

### Storage Options (decide later, schema is the same)
- **Phase 1:** Netlify Blobs (free, already configured)
- **Phase 2:** Cloudflare R2 (cheap, S3-compatible, no egress fees)
- **Phase 3:** S3 (if enterprise compliance requires it)

### What This Enables Later
- PO stage 3: upload sample photos
- PO stage 8: upload QC report
- Product Stack: attach tech pack PDF
- Vendor: store contracts, payment receipts
- Finance: attach invoices to payments

### Owner: Almond (schema), Danny (upload UI), Bonney (storage integration)
### Priority: Create the table now. Build upload UI when PO workflow needs it.

---

## Pattern 3: Users & Permissions

### What We Have
Site password (atica2026ops) + API tokens (hash-based, scoped).
No concept of "who is logged in" or "what can they do."

### What It Should Be
Users with roles. Roles determine what pages you see and what
actions you can take. Not full RBAC — just enough for a team of 5-15.

### Schema (create now, enforce later)
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- 'reuven', 'david', 'ari'
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',  -- owner, manager, pd, finance, warehouse, viewer
  stores TEXT[] DEFAULT '{}',    -- which stores they can see (empty = all)
  active BOOLEAN DEFAULT true,
  pin TEXT,                      -- 4-digit PIN for quick actions (store staff)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role capabilities (hardcoded in code, not in DB)
-- owner:     everything
-- manager:   all pages, all actions except delete MP
-- pd:        products, stacks, PO stages 1-4 and 7-8
-- finance:   PO stage 5, cash flow, payments
-- warehouse: receiving, transfers, distribution
-- viewer:    read-only everything
```

### What This Enables Later
- Staff uses the system without full access
- PO gates enforce "checked by [finance person]" with real names
- Activity log shows who did what
- Store-scoped views (warehouse sees only their store)
- Customer-facing portal (viewer role, restricted pages)

### Owner: Almond
### Priority: Create table. Don't build login yet. Just the schema.

---

## Pattern 4: Channels & Pricing

### What We Have
`sales.source = 'shopify'` and `sales.store = 'Lakewood'/'Online'`.
One price per product. No concept of wholesale vs retail.

### What It Should Be
Products can sell through multiple channels at different prices.
A channel is a way products reach customers.

### Current channels: Retail (4 stores), Online (Shopify)
### Future channels: Wholesale, Amazon, Custom/MTM

### Schema (minimal — extend sales, don't create new tables)
```sql
-- sales already has 'source' and 'store'. Add:
ALTER TABLE sales ADD COLUMN IF NOT EXISTS
  channel TEXT DEFAULT 'retail',  -- retail, online, wholesale, custom
  price_list TEXT DEFAULT 'standard';  -- standard, wholesale, clearance

-- Price lists on master_products
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS
  wholesale_price NUMERIC(10,2),
  wholesale_moq INTEGER DEFAULT 12;  -- minimum units for wholesale pricing
```

### What This Enables Later
- Wholesale: different price, different MOQ, different customers
- Amazon: track as a channel, different margin expectations
- Custom/MTM: track as channel, premium pricing
- Analytics: Group By channel. "Wholesale does 15% of revenue."
- Cash flow: wholesale has different payment terms (net-30 vs POS)

### Owner: Almond (schema), Bonney (channel detection during sync)
### Priority: Add columns. Don't build wholesale yet.

---

## Pattern 5: Notifications & Alerts

### What We Have
Nothing. No way to know "PO payment is overdue" without clicking
into cash flow and scrolling.

### What It Should Be
System-generated alerts based on events and conditions.
Displayed on the landing page. Optionally sent via email/SMS.

### Schema (simple — just a table)
```sql
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,            -- 'payment_overdue', 'stock_low', 'deadline_approaching',
                                 -- 'qc_failed', 'delivery_late', 'grade_changed'
  severity TEXT DEFAULT 'info',  -- info, warning, critical
  entity_type TEXT,              -- 'purchase_order', 'master_product', etc.
  entity_id TEXT,
  title TEXT NOT NULL,
  message TEXT,
  action_url TEXT,               -- link to the relevant page
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_unack ON alerts(acknowledged) WHERE acknowledged = false;
CREATE INDEX idx_alert_type ON alerts(type);
CREATE INDEX idx_alert_severity ON alerts(severity);
```

### Alert Triggers (computed, not real-time)
Run a daily job (or on sync completion) that checks:
- Any po_payments WHERE status = 'due' AND due_date < TODAY → payment_overdue
- Any master_products WHERE days_of_stock < 14 → stock_low
- Any purchase_orders WHERE current_deadline < TODAY → deadline_approaching
- Any styles WHERE grade changed from previous → grade_changed

### What This Enables Later
- Landing page shows: "3 alerts" with badges
- Email digest: daily summary of things needing attention
- SMS for critical: "Payment overdue: $12,500 on PO-0329"
- Slack integration: post alerts to #operations channel

### Owner: Almond (schema + trigger logic), Danny (alert display on landing page)
### Priority: Create table and basic trigger. Show on landing page.

---

## Pattern 6: Configurable Workflows (escape the ENUM trap)

### What We Have
`po_stage` is a Postgres ENUM:
```sql
CREATE TYPE po_stage AS ENUM (
  'concept','design','sample','approved','costed','ordered',
  'production','qc','shipped','in_transit','received','distribution'
);
```

Adding a stage requires a migration. Removing one is worse.
And this ENUM is the ONLY workflow in the system.

### What It Should Be
Workflows defined in config, not in schema. So you can add
stages, change order, add new workflow types (returns, transfers,
markdown approval) without touching the database.

### The Fix (do now, migrate later)
```sql
-- Don't use the ENUM for new code. Use TEXT.
ALTER TABLE purchase_orders ALTER COLUMN stage TYPE TEXT;
ALTER TABLE purchase_orders ALTER COLUMN stage SET DEFAULT 'concept';

-- Workflow definitions live in app_settings (JSONB)
INSERT INTO app_settings (key, value) VALUES ('workflow_po', '{
  "stages": [
    { "id": "concept", "index": 1, "gate": null, "owner": "pd" },
    { "id": "design", "index": 2, "gate": null, "owner": "pd" },
    { "id": "sample", "index": 3, "gate": null, "owner": "pd" },
    { "id": "approved", "index": 4, "gate": "pd", "owner": "pd" },
    { "id": "costed", "index": 5, "gate": "finance", "owner": "finance" },
    { "id": "ordered", "index": 6, "gate": null, "owner": "pd" },
    { "id": "production", "index": 7, "gate": null, "owner": "pd" },
    { "id": "qc", "index": 8, "gate": "pd", "owner": "pd" },
    { "id": "shipped", "index": 9, "gate": null, "owner": "logistics" },
    { "id": "in_transit", "index": 10, "gate": null, "owner": "logistics" },
    { "id": "received", "index": 11, "gate": null, "owner": "warehouse" },
    { "id": "distribution", "index": 12, "gate": null, "owner": "warehouse" }
  ]
}'::jsonb);
```

### What This Enables Later
- Add a "customs_clearance" stage between in_transit and received
- Create a returns workflow with different stages
- Create a markdown approval workflow
- Create a transfer workflow (pick → load → transit → deliver → confirm)
- All read from config. No migrations. No ENUMs.

### Owner: Almond (migration to TEXT + config)
### Priority: Convert ENUM to TEXT in next migration. Move stage list to config.

---

## Summary — The Envelope

| Pattern | Schema Now | Build Now | Build Later |
|---------|-----------|-----------|-------------|
| Events | audit_log exists | Add events to all DAL writes | Activity feed, notifications, undo |
| Documents | Create documents table | Nothing | Upload UI, file viewer |
| Users | Create users table | Nothing | Login, role enforcement |
| Channels | Add columns to sales + MP | Nothing | Wholesale, Amazon |
| Alerts | Create alerts table | Daily trigger + landing page badge | Email, SMS, Slack |
| Workflows | ENUM → TEXT + config | Nothing | New workflow types |

**Total schema work: ~6 table creates/alters. No feature code needed.**

The envelope is large. The build is small. When wholesale comes,
it's a bolt-on. When staff needs login, it's a bolt-on. When returns
need a workflow, it's a bolt-on. Because the patterns are already there.

---

## Migration 011 — The Envelope

```sql
-- Pattern 2: Documents
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

-- Pattern 3: Users
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

-- Pattern 4: Channels
ALTER TABLE sales ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'retail';
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2);
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS wholesale_moq INTEGER DEFAULT 12;

-- Pattern 5: Alerts
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

-- Pattern 6: Configurable Workflows
ALTER TABLE purchase_orders ALTER COLUMN stage TYPE TEXT USING stage::TEXT;
ALTER TABLE purchase_orders ALTER COLUMN stage SET DEFAULT 'concept';
-- Drop the enum (will fail silently if other tables still use it)
-- DROP TYPE IF EXISTS po_stage;

-- Collections (from STRATEGIC_DESIGN.md)
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

-- Returns (from STRATEGIC_DESIGN.md)
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
```
