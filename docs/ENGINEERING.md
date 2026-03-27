# Engineering Plan — Domain-Driven Work Segmentation

## The Problem We Keep Having

We organize by technical layer: DAL here, components there, API routes
elsewhere. Every feature touches every layer. Every session collides
with every other session. This doesn't scale.

## The Fix: Organize by Business Domain

The business has natural boundaries. Product development doesn't care
about van routes. Warehouse doesn't care about marketing attribution.
These are separate concerns that communicate through events.

Seven domains. Each self-contained. Sessions can't collide.

## The Seven Domains

### 1. Product
What: The thing you sell — from concept to end of life.
Owner: Shrek

Tables: master_products, product_stack, components, mp_components
Logic:
  - MP lifecycle (14 stages): concept → brief → sourcing → ... → EOL
  - Shopify product matching (title matchers → MP ID)
  - Tech pack completeness scoring
  - Demand classification (hot/rising/steady/slow/stockout)
  - Seasonal velocity adjustment

Events published:
  product.created, product.phase_changed, stack.updated, stack.completed
Events consumed:
  inventory.updated (show stock on product cards)

Shopify: reads products, matches to MPs. Pushes product updates and
price changes back when ready.

### 2. Supply Chain
What: Getting product made and delivered to your door.
Owner: Deshawn

Tables: purchase_orders, po_payments, vendors, po_stage_history
Logic:
  - PO lifecycle (12 stages): concept → ... → received → distribution
  - Stage gates (PD and Finance sign-off at key transitions)
  - Payment schedule generation (30/40/30, full, net30)
  - Vendor scoring (on-time %, quality, lead time accuracy)
  - Factory package generation (tech pack + PO details for vendor)

Events published:
  po.created, po.stage_advanced, po.costed, po.ordered
  po.shipped, po.received, po.cancelled
  payment.scheduled, payment.due, payment.overdue, payment.paid
Events consumed:
  product.phase_changed (auto-suggest PO when MP approved)

Boundary: Supply Chain ends when goods arrive at the warehouse.
That handoff is po.received → Logistics picks it up.

### 3. Logistics
What: The physical movement of goods through the real world.
Owner: unassigned

This is the domain most systems get wrong because they treat physical
movement as a database update. It's not. It's people, trucks, bins,
packing lists, and stores that may or may not do their job.

Tables: shipments, transfers, van_routes, bin_locations, receiving_log

Subdomains:

  RECEIVING
  - Container arrives from overseas → check against PO packing list
  - Flag discrepancies (wrong qty, wrong style, damage)
  - Put away into bin locations
  - Trigger: po.shipped from Supply Chain

  WAREHOUSING
  - Bin location management (where is each SKU?)
  - Pick lists (pull from bins for transfers or fulfillment)
  - Stock counts / cycle counting
  - Future: RFID scanning for real-time bin tracking

  TRANSFERS
  - Allocation: decide which stores get what (manual or auto)
  - Pick → pack → load on van
  - Store-to-store transfers (Lakewood has excess, Monsey needs)
  - Compliance: did the receiving store confirm? Escalate if not.

  VAN / DELIVERY
  - Route planning: warehouse → stores in optimal order
  - Load manifest: what's on the van, for which store
  - Delivery confirmation per store
  - Driver view: today's stops, items per stop, contact info

  FULFILLMENT
  - Online order → pick → pack → ship (or pick for wholesale)
  - Carrier integration (future: UPS/FedEx label generation)

Events published:
  shipment.arrived, shipment.received, shipment.discrepancy
  transfer.created, transfer.picked, transfer.loaded
  transfer.delivered, transfer.confirmed, transfer.overdue
  van.route_planned, van.departed, van.completed
  fulfillment.picked, fulfillment.shipped
  bin.assigned, bin.moved

Events consumed:
  po.shipped (incoming shipment expected — show on warehouse dashboard)
  po.received (handoff from Supply Chain — start receiving process)
  sale.recorded (online order → fulfillment queue)
  inventory.reorder_triggered (auto-create transfer suggestion)

Warehouse View (what the warehouse person sees):
  - Today's incoming shipments with ETAs
  - Receiving queue (containers to unpack)
  - Packing list check-off
  - Put-away queue (items without bin locations)
  - Pending transfers (what needs to go out to stores)
  - Van load plan for tomorrow
  - Route map with stops
  - Store compliance dashboard (who confirmed receipt, who hasn't)
  - Online fulfillment queue
  - Bin location search

### 4. Inventory
What: How much product is where — the numbers, not the movement.
Owner: Nikita

Tables: uses master_products inventory fields + future inventory_levels
Logic:
  - Stock by location (Lakewood, Flatbush, CH, Monsey, Online, Reserve)
  - Reorder calculation (velocity × cover weeks - stock - incoming)
  - Distribution weights (which stores get what % of new stock)
  - Days of stock / weeks of cover
  - Sell-through rate
  - Future: RFID count reconciliation vs system count

Events published:
  inventory.updated, inventory.low, inventory.stockout
  inventory.received, inventory.transferred
  inventory.reorder_triggered

Events consumed:
  transfer.confirmed (add stock to destination store)
  transfer.loaded (deduct stock from warehouse)
  shipment.received (add stock to warehouse)
  sale.recorded (deduct stock from selling location)
  fulfillment.shipped (deduct from online stock)

Shopify: reads inventory levels per location. Pushes adjustments
back when stock changes (the big one for RFID reconciliation).

Note: Inventory is the NUMBERS. Logistics is the MOVEMENT.
Inventory says "Monsey needs 30 units." Logistics makes it happen.

### 5. Sales
What: Selling product to customers.
Owner: Stallon

Tables: customers, wholesale_accounts
Logic:
  - POS feed (real-time from Shopify POS at each store)
  - Revenue by store, by product, by period
  - AOV, units per transaction
  - Customer tiers (bronze → diamond based on LTV)
  - Loyalty points
  - Wholesale pricing and terms
  - Customer size profiles (for personalized service)

Events published:
  sale.recorded, sale.refunded
  customer.created, customer.tier_changed, customer.ltv_updated
  pos.transaction

Events consumed:
  inventory.updated (show availability to sales staff)
  product.phase_changed (new arrivals notification)

Shopify: reads orders (online + POS), reads customers.
POS is Shopify POS — transactions come via webhooks.

### 6. Finance
What: The money picture.
Owner: unassigned

Tables: reads from po_payments, purchase_orders, app_settings
Logic:
  - Cash flow projection (12-week rolling)
  - AP: what we owe vendors (from PO payments)
  - AR: what's owed to us (wholesale invoices)
  - Margin analysis (FOB → landed → retail, by product and category)
  - Payment status management (planned → upcoming → due → overdue → paid)
  - OpEx tracking

Events published:
  cashflow.projected, payment.status_changed

Events consumed:
  po.created (new AP commitment)
  po.received (balance payment due)
  payment.due, payment.overdue (alerts)
  sale.recorded (revenue inflow)

Shopify: reads sales data for revenue side of cash flow.

### 7. Marketing
What: Driving demand to the right products.
Owner: future

Tables: campaigns
Logic:
  - Campaign ROI (spend vs attributed revenue)
  - ROAS by channel (Google, Meta, email)
  - Attribution (which campaign drove which sale)
  - Audience management (customer segments → ad platforms)
  - Seasonal planning (align ad spend with inventory)

Events published:
  campaign.launched, campaign.completed, attribution.matched

Events consumed:
  sale.recorded (attribution matching)
  customer.created (audience sync)
  product.phase_changed (promote new arrivals)
  inventory.low (pause ads for low-stock products)

Integrations: Google Ads API, Meta Ads API (future).

## How Goods Actually Flow

This is the physical reality the system must model:

```
VENDOR (overseas)
  │
  │ po.shipped
  ▼
CUSTOMS
  │
  │ shipment.arrived
  ▼
WAREHOUSE (receive)
  │ check packing list against PO
  │ flag discrepancies
  │ assign bin locations
  │
  ├──────────────────────────┐
  │                          │
  │ transfer.created         │ fulfillment.picked
  ▼                          ▼
VAN (pick → load → route)   SHIPPING (online orders)
  │                          │
  │ van.departed             │ fulfillment.shipped
  │                          ▼
  ├→ LAKEWOOD               CUSTOMER
  │   transfer.delivered
  │   transfer.confirmed ✓
  │
  ├→ MONSEY
  │   transfer.delivered
  │   transfer.confirmed ✓
  │
  ├→ CROWN HEIGHTS
  │   transfer.delivered
  │   transfer.confirmed ✗ ← ESCALATE
  │
  └→ FLATBUSH
      transfer.delivered
      transfer.confirmed ✓
```

## Directory Structure

```
lib/
  product/
    index.js           ← public API
    queries.js          ← product SQL
    logic.js            ← matching, demand, velocity
    seeds.js            ← MP_SEEDS data

  supply-chain/
    index.js
    queries.js          ← PO, vendor, payment SQL
    logic.js            ← stage gates, payment schedule, side effects

  logistics/
    index.js
    queries.js          ← shipment, transfer, bin, van SQL
    logic.js            ← route planning, allocation, compliance
    receiving.js        ← packing list verification
    transfers.js        ← pick/pack/deliver flow
    routing.js          ← van route optimization

  inventory/
    index.js
    queries.js          ← stock levels, reorder queries
    logic.js            ← reorder calc, distribution, seasonal

  sales/
    index.js
    queries.js          ← customer, order queries
    logic.js            ← loyalty, LTV, POS aggregation

  finance/
    index.js
    queries.js          ← cash flow, margin queries
    logic.js            ← projection, landed cost, payment status

  marketing/
    index.js            ← stub for now

  shared/
    db.js               ← neon() connection
    events.js           ← event bus
    shopify.js          ← Shopify REST client
    locations.js        ← store normalization

app/
  api/                  ← thin HTTP routes
  (dashboard)/          ← admin perspective (default)

components/
  ui/                   ← primitives (Card, Table, Badge, Button)

supabase/
  migrations/           ← schema evolution

test/
  product.test.js
  supply-chain.test.js
  logistics.test.js
  inventory.test.js
```

## Rules

### 1. Domains never import each other directly
Product NEVER requires supply-chain. Supply Chain NEVER requires sales.
Communication is through events ONLY.

Wrong: const po = require('../supply-chain').getById(poId);
Right: subscribe to po.created event in your domain's init.

### 2. Each domain has one public API (index.js)
Pages and API routes import ONLY from index.js.
Never from queries.js or logic.js.

### 3. SQL in queries.js, logic in logic.js
queries.js talks to database. Returns plain objects.
logic.js is pure functions. No database. Fully testable.

### 4. Shared layer is small and stable
db.js, events.js, shopify.js, locations.js. ~500 lines total.
If you're adding to shared, ask: does this belong to a domain?

### 5. Pages are thin
Call domain. Render components. No SQL. No business logic.

### 6. Events are the contract between domains
Change an event shape = coordinate across domains.
Everything else is internal to the domain.

## Session Assignment

| Session  | Domain       | Directory          |
|----------|--------------|--------------------|
| Shrek    | Product      | lib/product/       |
| Deshawn  | Supply Chain | lib/supply-chain/  |
| Stallon  | Sales        | lib/sales/         |
| Nikita   | Inventory    | lib/inventory/     |
| (new)    | Logistics    | lib/logistics/     |
| (future) | Finance      | lib/finance/       |
| (future) | Marketing    | lib/marketing/     |
| Trump    | Oversight    | —                  |

## Event Contracts

These are the INTERFACES between domains.

```
# Supply Chain → Logistics
po.shipped          { poId, mpId, container, vessel, etd, eta, items }
po.received         { poId, items: [{sku, qty}], location }

# Logistics → Inventory
shipment.received   { shipmentId, poId, items, binLocations }
transfer.confirmed  { transferId, fromLocation, toLocation, items }
fulfillment.shipped { orderId, items }

# Logistics → Logistics (internal)
transfer.created    { transferId, fromLocation, toLocation, items }
transfer.picked     { transferId, picker }
transfer.loaded     { transferId, vanRouteId }
van.route_planned   { routeId, stops: [{store, items, eta}] }
van.departed        { routeId, departedAt }
transfer.delivered  { transferId, store, deliveredAt }
transfer.overdue    { transferId, store, expectedAt }

# Sales → Inventory
sale.recorded       { orderId, store, items: [{mpId, sku, qty}], total }

# Inventory → Logistics
inventory.reorder_triggered { mpId, location, deficit, suggestedQty }

# Product
product.phase_changed { mpId, from, to }
stack.updated         { mpId, fields, completeness }

# Finance
payment.due         { paymentId, poId, amount, dueDate }
payment.overdue     { paymentId, poId, amount, daysPastDue }

# Marketing
campaign.launched   { campaignId, platform, budget, mpIds }
attribution.matched { saleId, campaignId, channel }
```

## New Tables for Logistics

```sql
-- Bin locations in warehouse
CREATE TABLE bin_locations (
  id TEXT PRIMARY KEY,           -- 'A-01-03' (aisle-rack-shelf)
  zone TEXT,                     -- 'receiving', 'storage', 'picking', 'staging'
  current_sku TEXT,
  current_qty INTEGER DEFAULT 0,
  max_qty INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transfers between locations
CREATE TABLE transfers (
  id TEXT PRIMARY KEY,
  from_location TEXT NOT NULL,   -- 'Reserve' or bin ID
  to_location TEXT NOT NULL,     -- 'Lakewood', 'Flatbush', etc.
  status TEXT DEFAULT 'planned', -- planned → picked → loaded → in_transit → delivered → confirmed
  items JSONB NOT NULL,          -- [{mpId, sku, qty}]
  total_units INTEGER,
  van_route_id TEXT,
  picked_by TEXT,
  picked_at TIMESTAMPTZ,
  loaded_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Van delivery routes
CREATE TABLE van_routes (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  status TEXT DEFAULT 'planned', -- planned → loaded → departed → completed
  driver TEXT,
  stops JSONB NOT NULL,          -- [{store, transferIds, eta, arrived, notes}]
  departed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_units INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Receiving log (packing list verification)
CREATE TABLE receiving_log (
  id SERIAL PRIMARY KEY,
  shipment_id TEXT REFERENCES shipments(id),
  po_id TEXT REFERENCES purchase_orders(id),
  expected_items JSONB,          -- from packing list
  received_items JSONB,          -- what actually arrived
  discrepancies JSONB,           -- [{sku, expected, received, note}]
  received_by TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending'  -- pending → in_progress → complete → disputed
);
```

## Migration Path

Phase 1: Restructure lib/ into domain directories.
         Move existing code, keep tests passing.
Phase 2: Build Logistics domain (the missing piece).
Phase 3: Wire events between all domains.
Phase 4: Shopify write-back (Inventory pushes stock to Shopify).
Phase 5: Logistics tables + warehouse UI.
Phase 6: Van route planning.
Phase 7: Marketing adapters.
Phase 8: RFID integration (Inventory + Logistics).
Phase 9: Auth + role-based perspectives.

## Perspectives vs Domains

Domains OWN data. Perspectives COMPOSE views across domains.

A domain is a team that creates and manages entities: Product creates
MPs, Supply Chain creates POs, Logistics creates transfers. They own
their tables. They define their events.

A perspective is a user who CONSUMES from multiple domains. A store
manager doesn't create POs or plan van routes. They receive transfers,
sell products, and need to see what's coming. That's not a domain.
It's a lens.

### Store Perspective

The Flatbush store manager opens the app and sees:

FROM LOGISTICS:
  - Van arriving tomorrow at ~2pm with 3 boxes
  - Load manifest: 15× Londoner White, 8× HC360 Navy, 12× Parkway Khaki
  - Pending transfer confirmation (Monsey sent 5 items 2 days ago — confirm?)
  - Their receiving history

FROM SALES:
  - Today's revenue: $2,340 (12 transactions, $195 AOV)
  - This week vs last week
  - Top selling items
  - Walk-in customer lookup

FROM INVENTORY:
  - Current stock by product
  - What's low / what's out
  - Items they need but don't have (customer requests)

FROM SUPPLY CHAIN (shallow):
  - "3 POs arriving this month" (not the full PO detail — just awareness)
  - "New Londoner colorway in production, ETA 6 weeks"

FROM MARKETING:
  - "Instagram campaign running on HC360 — expect traffic"
  - "20% off Parkway this weekend — prepare stock"

The store doesn't write to any of these domains. It reads from all of
them. The only things a store WRITES are:
  - transfer.confirmed (yes I received these items)
  - sale.recorded (happens automatically via Shopify POS)
  - customer notes (size preferences, special requests)

### Executive Perspective

Reuven opens the app and sees the health of the whole system:
  - Revenue trend (Sales)
  - Cash position + 12-week projection (Finance)
  - Active PO pipeline (Supply Chain)
  - Incoming shipments with ETAs (Logistics)
  - Stock alerts (Inventory)
  - Campaign ROAS (Marketing)
  - Store-by-store performance (Sales × Inventory)

Not a domain. A composition.

### Warehouse Perspective

The warehouse manager sees:
  - Incoming containers with ETAs (Logistics)
  - Today's receiving queue (Logistics)
  - Packing list verification (Logistics × Supply Chain)
  - Put-away queue — items without bin locations (Logistics)
  - Transfer prep — what needs to go to which stores (Logistics × Inventory)
  - Van load plan for tomorrow (Logistics)
  - Online fulfillment queue (Logistics × Sales)
  - Bin location search (Logistics)
  - Store compliance — who confirmed receipt, who hasn't (Logistics)

Almost entirely Logistics domain. The warehouse perspective is
basically the Logistics domain's primary UI.

### Finance Perspective

Finance sees:
  - Cash flow projection (Finance, but data from everywhere)
  - AP schedule — upcoming vendor payments (Supply Chain → Finance)
  - Payment status board — planned/upcoming/due/overdue (Finance)
  - Shipment-triggered payments (Logistics → Finance)
  - Revenue inflow (Sales → Finance)
  - Margin analysis by product (Product + Sales)
  - AR — wholesale invoices outstanding (Sales → Finance)

Finance READS from Supply Chain, Logistics, and Sales.
Finance WRITES payment statuses and projections.

## Cross-Domain Data Flows

These are the critical paths where domains must share data.
Each flow is an event. No direct imports.

### The Money-Goods Connection (Finance ↔ Logistics ↔ Supply Chain)

This is the one most systems get wrong. The timeline of money is
inseparable from the timeline of physical goods:

```
PO ordered (Supply Chain)
  → payment.scheduled: deposit 30% due now
  → Finance subscribes: adds to AP projection

PO shipped (Supply Chain)
  → Logistics subscribes: expects container at port
  → payment.scheduled: production 40% due on ship

Shipment at customs (Logistics)
  → Finance subscribes: duty payment imminent
  → shipment.customs_entry { dutyAmount, brokerFees }

Shipment cleared (Logistics)
  → Finance subscribes: duty + freight paid
  → payment.due: balance 30% on arrival

Shipment received at warehouse (Logistics)
  → Inventory subscribes: stock added
  → Finance subscribes: landed cost finalized
  → Supply Chain subscribes: PO marked received
```

Finance can't project cash flow without knowing:
  - Which shipments are in transit (Logistics)
  - When they'll clear customs (Logistics)
  - What duties are owed (Logistics × Supply Chain)
  - When balance payments trigger (Supply Chain)

### The Reorder Loop (Inventory → Supply Chain → Logistics → Inventory)

```
Inventory detects low stock on Londoner at Monsey
  → inventory.low { mpId: 'londoner', location: 'Monsey', available: 4 }

Option A: Transfer from warehouse
  → Logistics creates transfer (warehouse → Monsey)
  → Picks, loads van, delivers
  → Store confirms
  → Inventory updated

Option B: No warehouse stock — need new PO
  → inventory.reorder_triggered { mpId, deficit: 200 }
  → Supply Chain: buyer sees reorder suggestion
  → Buyer creates PO → vendor → production → ship → ...
  → Eventually arrives at warehouse
  → Logistics distributes to stores
```

### Store ↔ Logistics (The Daily Loop)

```
Every evening:
  Inventory calculates per-store needs
  → Logistics auto-generates transfer suggestions
  → Warehouse reviews, adjusts, confirms
  → Pick list generated
  → Morning: picker pulls from bins
  → Load van
  → Plan route (Lakewood first? Monsey first? Depends on urgency)
  → Van departs
  → Deliver to each store
  → Each store confirms receipt
  → If store doesn't confirm within 4 hours → escalate
  → Inventory updated per confirmed transfer
```

### Sales → Everyone

Every sale touches almost every domain:

```
sale.recorded { orderId, store: 'Flatbush', items, total }
  → Inventory: deduct stock at Flatbush
  → Finance: record revenue inflow
  → Product: update velocity per week
  → Inventory: check if below reorder threshold
  → Marketing: attempt campaign attribution
  → Sales: update customer LTV
```

This is WHY the event bus matters. A sale is one fact.
Seven domains care about it. Without events, you'd have
one function calling seven other functions and creating
a dependency nightmare.

## Implementation: Perspectives

Perspectives are Next.js route groups with their own layouts.
They call domain functions and compose the view.

```
app/
  (admin)/             ← sees everything
    layout.js          ← full sidebar
    page.js            ← system health dashboard
    
  (store)/             ← store employee view
    layout.js          ← store-specific sidebar
    page.js            ← today's sales + incoming + stock
    receiving/page.js  ← confirm transfers
    
  (warehouse)/         ← warehouse manager view
    layout.js          ← logistics-focused sidebar
    page.js            ← receiving queue + transfers + van
    receiving/page.js  ← packing list check
    van/page.js        ← route planning
    
  (finance)/           ← finance team view
    layout.js          ← finance sidebar
    page.js            ← cash position + projection
    payments/page.js   ← payment board
    
  (executive)/         ← Reuven's view
    layout.js          ← high-level sidebar
    page.js            ← everything that matters, one screen
```

Each perspective imports from domain public APIs.
No perspective owns data. Domains own data.

A page in the store perspective:
```javascript
// app/(store)/page.js
const logistics = require('../../lib/logistics');
const sales = require('../../lib/sales');
const inventory = require('../../lib/inventory');

const incoming = await logistics.getIncomingForStore('Flatbush');
const todaySales = await sales.getTodayByStore('Flatbush');
const stockAlerts = await inventory.getLowStockForStore('Flatbush');
```

Three domain calls. No SQL. No business logic in the page.
Each domain owns its own queries and can change independently.
