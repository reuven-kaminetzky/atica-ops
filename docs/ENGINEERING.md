# Engineering Plan — Domain-Driven Work Segmentation

## The Problem We Keep Having

We organize by technical layer: DAL here, components there, API routes
elsewhere. Every feature touches every layer. Every session collides
with every other session. Adding Google Ads means touching 8 files
across 4 directories. This doesn't scale.

## The Fix: Organize by Business Domain

The business has natural boundaries. Product development doesn't need
to know how cash flow projection works. Purchasing doesn't care about
marketing attribution. These are separate concerns.

Six domains. Each one is self-contained. A session working on Supply
Chain literally cannot break Inventory because they're in different
directories with different files.

## The Six Domains

### 1. Product (owner: Shrek)
What: The thing you sell.
Tables: master_products, product_stack, components, mp_components
Logic: MP lifecycle (14 stages), Shopify product matching, tech pack
       completeness, demand classification, seasonal velocity
Events published: product.created, product.phase_changed, stack.updated
Events consumed: inventory.updated (to show stock on product cards)
Shopify: reads products, matches to MPs. Eventually pushes product
         updates and price changes back.

### 2. Supply Chain (owner: Deshawn)
What: Getting product made and delivered.
Tables: purchase_orders, po_payments, shipments, vendors, po_stage_history
Logic: PO lifecycle (12 stages), stage gates (PD/Finance sign-off),
       payment schedule generation, shipment tracking, vendor scoring
Events published: po.created, po.stage_advanced, po.received,
                  payment.due, payment.overdue, shipment.arrived
Events consumed: product.phase_changed (auto-create PO when approved)
Shopify: none directly. Supply chain is internal.

### 3. Inventory (owner: unassigned)
What: Where product is right now.
Tables: uses master_products.inventory fields (stock, velocity, signal)
        + future inventory_locations table for per-store stock
Logic: stock by location, reorder calculation, distribution weights,
       transfer between stores, receiving from shipments, RFID
Events published: inventory.low, inventory.stockout, inventory.received
Events consumed: po.received (add stock), sale.recorded (deduct stock),
                 shipment.delivered (add to location)
Shopify: reads inventory levels per location. Eventually pushes
         adjustments back (the big one for RFID).

### 4. Sales (owner: Stallon)
What: Selling product to customers.
Tables: customers, wholesale_accounts, (reads from Shopify orders)
Logic: POS feed, revenue by store, AOV, customer tiers, loyalty,
       wholesale pricing, order history
Events published: sale.recorded, customer.created, customer.tier_changed
Events consumed: inventory.updated (show availability to sales staff)
Shopify: reads orders (online + POS), reads customers, reads locations
         for POS mapping. Shopify POS is the source of truth for sales.

### 5. Finance (owner: unassigned)
What: The money picture.
Tables: reads from po_payments, purchase_orders, app_settings
Logic: cash flow projection (12-week), AP/AR, margin analysis,
       landed cost calculation, payment status management
Events published: payment.paid, cashflow.projected
Events consumed: po.created (new commitment), sale.recorded (revenue),
                 payment.due, payment.overdue
Shopify: reads sales data for revenue side of cash flow.

### 6. Marketing (owner: future)
What: Driving demand.
Tables: campaigns (+ future integrations)
Logic: campaign ROI, spend tracking, attribution, audience management
Events published: campaign.launched, attribution.matched
Events consumed: sale.recorded (attribution), customer.created (audience)
Integrations: Google Ads API, Meta Ads API (future adapters)

## Directory Structure

```
lib/
  product/
    index.js          ← public API (what other domains can call)
    queries.js         ← all SQL for product tables
    logic.js           ← business rules (matching, demand, velocity)
    seeds.js           ← MP_SEEDS data (moved from products.js)
    
  supply-chain/
    index.js           ← public API
    queries.js         ← all SQL for PO/vendor/shipment/payment tables
    logic.js           ← stage gates, payment schedule, side effects
    
  inventory/
    index.js           ← public API
    queries.js         ← stock queries, reorder queries
    logic.js           ← reorder calc, distribution, seasonal adjustment
    
  sales/
    index.js           ← public API
    queries.js         ← customer, wholesale, order queries
    logic.js           ← loyalty tiers, LTV, POS aggregation
    
  finance/
    index.js           ← public API
    queries.js         ← cash flow, margin, AP/AR queries
    logic.js           ← projection, landed cost, payment status
    
  marketing/
    index.js           ← public API (stub for now)
    
  shared/
    db.js              ← neon() connection (one place)
    events.js          ← event bus
    shopify.js         ← Shopify REST client
    locations.js       ← store normalization
    
app/
  api/                 ← thin routes: validate → call domain → respond
  (dashboard)/         ← pages: call domain → render components
  
components/
  ui/                  ← primitives (Card, Table, Badge, Button)

supabase/
  migrations/          ← schema evolution
  
test/
  product.test.js      ← tests per domain
  supply-chain.test.js
  inventory.test.js
```

## Rules

### 1. Domains don't import each other
Product NEVER requires supply-chain. Supply Chain NEVER requires sales.
They communicate through events. Period.

If Product needs to know about POs, it subscribes to `po.created`.
If Supply Chain needs product data, it subscribes to `product.phase_changed`.

### 2. Each domain exposes a public API (index.js)
Other code (pages, API routes) imports ONLY from index.js.
Never from queries.js or logic.js directly.

```javascript
// CORRECT
const product = require('./lib/product');
const mp = await product.getById('londoner');

// WRONG
const { getById } = require('./lib/product/queries');
```

### 3. SQL lives in queries.js, logic lives in logic.js
queries.js: database calls, returns plain objects
logic.js: pure functions, no database, fully testable

### 4. Shared layer is SMALL and STABLE
db.js, events.js, shopify.js, locations.js. That's it.
If you're adding to shared, you're probably wrong.
Ask: does this belong to a specific domain?

### 5. Pages are thin
A page calls domain functions and renders components.
No SQL. No business logic. No Shopify calls.

```javascript
// Product list page
const products = await product.getAll();
return <ProductGrid products={products} />;
```

### 6. API routes are thin
Validate input. Call domain function. Return response.
Event emission happens inside the domain, not in the route.

### 7. Tests are per domain
Each domain has its own test file.
Tests import from domain index.js only.
Domain logic tests need no database (pure functions).
Domain query tests need a test database.

## Session Assignment

Each Claude session owns a domain. They work in their own directory.
They can't break each other. Coordination happens through:
- Event contracts (what events exist, what data they carry)
- Public APIs (what functions each domain exposes)
- Schema migrations (coordinated, sequential)

| Session  | Domain        | Directory           | Tables                               |
|----------|---------------|---------------------|--------------------------------------|
| Shrek    | Product       | lib/product/        | master_products, product_stack       |
| Deshawn  | Supply Chain  | lib/supply-chain/   | purchase_orders, vendors, shipments  |
| Stallon  | Sales         | lib/sales/          | customers, wholesale_accounts        |
| Nikita   | Inventory     | lib/inventory/      | inventory_locations (future)         |
| (future) | Finance       | lib/finance/        | (reads from supply-chain tables)     |
| (future) | Marketing     | lib/marketing/      | campaigns                            |
| Trump    | Oversight     | —                   | ensures nobody rests                 |

## Event Contracts

This is the INTERFACE between domains. Change these carefully.

```
po.created        { poId, mpId, vendor, fob, units, fobTotal }
po.stage_advanced { poId, from, to, checkedBy }
po.received       { poId, mpId, items: [{sku, qty}], location }
sale.recorded     { orderId, store, total, items: [{mpId, qty, price}] }
inventory.low     { mpId, location, available, threshold }
inventory.stockout { mpId, location }
product.phase_changed { mpId, from, to }
payment.due       { paymentId, poId, amount, dueDate }
payment.overdue   { paymentId, poId, amount, daysPastDue }
customer.tier_changed { customerId, from, to, ltv }
```

## Migration Path

Phase 1: Restructure lib/ into domain directories.
         Move existing code, don't rewrite. Tests keep passing.

Phase 2: Wire events between domains.
         Supply Chain emits po.received → Inventory subscribes.
         Sales emits sale.recorded → Inventory subscribes.

Phase 3: Build missing domains (Finance, Marketing as stubs).

Phase 4: Shopify write-back in Inventory domain.

Phase 5: Google/Meta adapters in Marketing domain.

Phase 6: RFID adapter in Inventory domain.

Phase 7: Auth + role-based perspectives.

Each phase is independent. Each domain is independent.
No session blocks another. No feature requires touching 8 files.
