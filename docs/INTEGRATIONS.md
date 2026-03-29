# External Integrations Architecture

## The Problem

Shopify is hardcoded everywhere — column names (`shopify_product_id`),
domain model references, DAL queries, sync logic. Adding QuickBooks,
Amazon, or RFID would require touching every layer.

## The Solution: Ports & Adapters

The domain layer defines WHAT data it needs (ports).
Each external system implements HOW to provide it (adapters).
The domain never knows which system the data came from.

```
                    ┌──────────────────────────────┐
                    │       DOMAIN LAYER            │
                    │  (product, supply-chain,      │
                    │   inventory, finance, sales)   │
                    └──────────┬───────────────────┘
                               │ PORTS (interfaces)
              ┌────────────────┼────────────────────┐
              │                │                     │
    ┌─────────▼──────┐ ┌──────▼──────┐ ┌───────────▼────────┐
    │  SALES PORT    │ │ FINANCE PORT│ │  INVENTORY PORT     │
    │                │ │             │ │                     │
    │ getSales()     │ │ getAP()     │ │ getStockLevels()    │
    │ getOrders()    │ │ getAR()     │ │ adjustStock()       │
    │ getRevenue()   │ │ sync()      │ │ getMovements()      │
    └────┬───────┬───┘ └──┬──────┬──┘ └──┬──────┬──────┬───┘
         │       │        │      │        │      │      │
    Shopify  Amazon    QuickBooks │    Shopify  RFID  Warehouse
    Adapter  Adapter   Adapter   │    Adapter  Reader  Scanner
                              Xero
                              Adapter
```

## Ports (what the domain needs)

### Sales Port
```javascript
// lib/ports/sales.js
{
  getOrders({ since, until })     → [{ id, date, total, items[], source, store }]
  getRevenue({ period, groupBy }) → { total, byStore[], byProduct[] }
  getCustomer(id)                 → { name, email, orders, lifetime_value }
}
```
**Adapters:** Shopify POS, Shopify Online, Amazon Seller Central

### Finance Port
```javascript
// lib/ports/finance.js
{
  getPayables({ status })         → [{ vendor, amount, due, poRef }]
  getReceivables({ status })      → [{ customer, amount, due, invoiceRef }]
  recordPayment(data)             → { id, status }
  syncJournal({ since })          → [{ date, account, debit, credit }]
}
```
**Adapters:** QuickBooks, Xero, manual entry

### Inventory Port
```javascript
// lib/ports/inventory.js
{
  getStockLevels({ location })    → [{ sku, mpId, location, qty }]
  adjustStock(sku, location, delta, reason) → { newQty }
  getMovements({ since })         → [{ sku, from, to, qty, timestamp, method }]
  onStockChange(callback)         → subscription (webhook or polling)
}
```
**Adapters:** Shopify Inventory, RFID readers, manual count, warehouse scanner

### Product Catalog Port
```javascript
// lib/ports/catalog.js
{
  getProducts()                   → [{ externalId, title, price, image, variants[] }]
  getProduct(externalId)          → { ... }
  onProductChange(callback)       → subscription
}
```
**Adapters:** Shopify, Amazon Listings

## How It Works in Practice

### Current (Shopify-only, hardcoded)
```
sync route → lib/shopify.js → raw API calls → write to master_products.shopify_product_ids
```

### Future (multi-source, decoupled)
```
sync route → lib/adapters/shopify-catalog.js → catalog port → domain.syncProducts()
                                                                    ↓
           lib/adapters/qb-finance.js → finance port → domain.syncPayables()
                                                                    ↓
           lib/adapters/rfid-inventory.js → inventory port → domain.adjustStock()
```

## Schema Changes Required

### Phase 1: Rename Shopify-specific columns (non-breaking)

```sql
-- master_products
ALTER TABLE master_products RENAME COLUMN shopify_product_ids TO external_ids;
ALTER TABLE master_products ADD COLUMN external_source TEXT DEFAULT 'shopify';

-- styles
ALTER TABLE styles RENAME COLUMN shopify_product_id TO external_product_id;
ALTER TABLE styles RENAME COLUMN shopify_handle TO external_handle;
ALTER TABLE styles RENAME COLUMN shopify_tags TO tags;
ALTER TABLE styles ADD COLUMN source TEXT DEFAULT 'shopify';

-- customers
ALTER TABLE customers RENAME COLUMN shopify_id TO external_id;
ALTER TABLE customers ADD COLUMN source TEXT DEFAULT 'shopify';
```

### Phase 2: External connections table

```sql
CREATE TABLE external_connections (
  id TEXT PRIMARY KEY,              -- 'shopify-main', 'quickbooks-prod', 'rfid-warehouse'
  type TEXT NOT NULL,               -- 'shopify', 'quickbooks', 'amazon', 'rfid'
  name TEXT NOT NULL,               -- Human name
  config JSONB DEFAULT '{}',        -- Connection-specific config (encrypted at rest)
  status TEXT DEFAULT 'active',     -- active, paused, error
  last_sync TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE external_events (
  id SERIAL PRIMARY KEY,
  connection_id TEXT REFERENCES external_connections(id),
  event_type TEXT NOT NULL,         -- 'order.created', 'inventory.adjusted', 'payment.recorded'
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## QuickBooks Integration

**What it gives us:** AP/AR, journal entries, bank reconciliation, P&L.
**Port:** Finance
**Sync pattern:** OAuth2 → pull payables/receivables → write to po_payments + cash flow

```
QuickBooks webhooks → /api/webhooks/quickbooks
  → finance port adapter
  → update po_payments status
  → update cash flow projection
```

PO payment workflow:
1. PO created → payment schedule generated in our system
2. Payment becomes "due" → QuickBooks creates bill
3. Bill paid in QuickBooks → webhook fires → our system marks payment "paid"
4. Cash flow updates automatically

## Amazon Integration

**What it gives us:** Additional sales channel, separate inventory pool.
**Port:** Sales + Catalog
**Sync pattern:** SP-API → pull orders/listings → unify with Shopify data

The key insight: an Amazon listing maps to the SAME MP as a Shopify listing.
A "Half Canvas Suit Navy" on Amazon = "Half Canvas Suit Navy" on Shopify = same style.
The matcher logic works on title, regardless of source.

## RFID Integration

**What it gives us:** Real-time physical inventory, receiving verification, 
anti-theft, item-level tracking.

**Port:** Inventory
**Hardware:** RFID readers at receiving dock, store floor, fitting rooms, POS.
**Tags:** UHF RFID tags in garment labels (EPC Gen2, ~$0.05/tag at scale).

### How RFID flows through the system:

```
RFID Reader (dock)
  → scans incoming container
  → hits POST /api/inventory/rfid-scan
  → adapter validates against PO expected items
  → receiving_log updated
  → stage advances to "received" if all items scanned

RFID Reader (store floor)
  → periodic sweep (every 15 min)
  → hits POST /api/inventory/rfid-count
  → adapter compares to expected stock
  → flags discrepancies (shrinkage, misplaced)

RFID Reader (POS)
  → customer purchases item
  → tag deactivated at register
  → inventory decremented in real-time
  → no barcode scanning needed
```

### RFID Data Model:

```sql
CREATE TABLE rfid_tags (
  epc TEXT PRIMARY KEY,              -- Electronic Product Code (unique per item)
  sku TEXT,                          -- links to variant
  mp_id TEXT REFERENCES master_products(id),
  style_id TEXT REFERENCES styles(id),
  location TEXT,                     -- last known location
  status TEXT DEFAULT 'active',      -- active, sold, returned, lost
  po_id TEXT,                        -- which PO brought it in
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  sold_at TIMESTAMPTZ
);

CREATE TABLE rfid_scans (
  id SERIAL PRIMARY KEY,
  reader_id TEXT NOT NULL,           -- which reader
  location TEXT NOT NULL,            -- Lakewood, Reserve dock, etc
  epc TEXT NOT NULL,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RFID Benefits for Atica:
- **Receiving:** Scan a container, auto-verify against PO. No manual count.
- **Transfers:** Van loads items, store confirms receipt by scanning. Auto-confirm.
- **Shrinkage detection:** Floor count vs expected = instant discrepancy report.
- **Restock triggers:** Item sold → RFID deactivated → inventory decrements → 
  if below threshold → auto-generates transfer request from Reserve.
- **Customer experience:** No barcode hunt at POS. Place garment on pad, done.

## Implementation Phases

### Phase 0 (now): Clean up Shopify coupling
- Rename shopify_* columns to external_*
- Move lib/shopify.js behind a catalog adapter interface
- All sync logic goes through ports, not direct Shopify calls

### Phase 1: QuickBooks (highest value)
- OAuth2 flow for QB connection
- Finance port adapter
- Auto-sync AP from PO payments → QB bills
- Auto-sync AR from Shopify orders → QB invoices
- Cash flow projection uses real QB data

### Phase 2: RFID (highest operational impact)
- Start with receiving dock (verify containers against POs)
- Add store floor counts (weekly reconciliation → daily → real-time)
- Add POS integration (tag deactivation on sale)
- Requires hardware procurement: readers + tags

### Phase 3: Amazon (new revenue channel)
- SP-API connection
- Sales port adapter
- Unified inventory across Shopify + Amazon
- Split analytics by channel

## What NOT to build ourselves

- **Payment processing** — Shopify handles this
- **Accounting engine** — QuickBooks handles this
- **Warehouse management** — we're not at the scale for a WMS
- **RFID middleware** — use vendor SDK (Impinj, Zebra)

Our system is the BRAIN. It doesn't process payments, do accounting,
or talk to RFID hardware directly. It integrates the data from systems
that do those things, and makes decisions based on unified intelligence.
