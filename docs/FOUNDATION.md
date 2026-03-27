# Atica Ops — Foundation

## What this system is

An operations brain for a menswear retailer running 4 stores + online.
It answers five questions every day:

1. What to reorder
2. Where to put stock
3. What's selling and what's dying
4. Where's the money (in, out, when)
5. Where's my shipment

## The truth chain

Every number on screen must trace back to a source:

```
Shopify (source of truth for products, inventory, sales)
    ↓
Sync (maps Shopify → our product hierarchy)
    ↓
Postgres (stores organized, enriched data)
    ↓
Domain logic (computes velocity, signals, projections)
    ↓
Screen (shows numbers user can trust)
```

If any link in this chain is broken, every number downstream is wrong.

## Core schema (what we actually need)

### Tier 1 — Required for the system to function

```
master_products     Product tree root. One row per MP.
                    Links to Shopify via external_ids[].
                    Carries: FOB, retail, duty, vendor, inventory, velocity, signal.

styles              One row per Shopify product (colorway).
                    FK → master_products. Carries: image, inventory, retail, grade.

vendors             Who we buy from. Lead time, terms, country.

purchase_orders     Supply pipeline. Stage-gated (concept → received).
                    FK → master_products, vendors.

po_payments         Cash outflow schedule. Auto-generated per PO.
                    Statuses: planned → upcoming → due → overdue → paid.
```

### Tier 2 — Required for operational depth

```
store_inventory     Per-store, per-style stock levels.
                    Source: Shopify inventory per location.
                    THIS TABLE DOESN'T EXIST YET. CRITICAL GAP.

sales               Historical order data. Source: Shopify orders.
                    Lets us compute velocity without hitting the API every time.
                    THIS TABLE DOESN'T EXIST YET. CRITICAL GAP.

po_stage_history    Audit trail for PO stage transitions.
product_stack       Tech pack / construction spec per MP.
plm_history         Product lifecycle changes.
shipments           Container/vessel tracking for in-transit POs.
```

### Tier 3 — Nice to have, build later

```
transfers           Stock movements between locations.
van_routes          Delivery scheduling.
receiving_log       Dock receiving verification.
customers           CRM data from Shopify.
audit_log           General audit trail.
```

### Not needed yet (remove from migrations)

```
campaigns           No marketing module.
wholesale_accounts  No wholesale module.
components          Not tracking components.
mp_components       Not tracking components.
attachments         No file management.
bin_locations       No bin-level warehouse.
external_connections  No integrations yet.
external_events     No integrations yet.
```

## The sync contract

Sync is the foundation of everything. If sync doesn't work, nothing works.

### What sync must do:

1. Pull all active Shopify products (paginated, handles 1000+)
2. Match each product to an MP using title matchers
3. Store each matched product as a Style record
4. Compute total inventory per MP (sum of variant quantities)
5. Pull per-location inventory → store in store_inventory
6. Pull recent orders → store in sales table
7. Compute velocity (units/week over trailing 30 days)
8. Classify demand signal (hot/rising/steady/slow)
9. Report: matched count, unmatched titles, errors

### What sync must NOT do:

- Timeout (break into steps, each < 25 seconds)
- Guess at data (only store what Shopify actually returns)
- Lose partial results (if step 3 fails, steps 1-2 should persist)
- Run without verification (log every match decision)

## Architecture rules

1. **Shopify is the source of truth** for products, inventory, and sales.
   We never invent data. We compute FROM Shopify data.

2. **Domain modules own all business logic.**
   API routes and pages are thin. They call domain, domain calls DAL.

3. **DAL owns all SQL.**
   No raw SQL outside lib/dal/. No exceptions.

4. **Server actions for all internal data.**
   Pages and client components never call API routes.
   API routes exist only for external callers (webhooks, sync).

5. **Every number must be traceable.**
   If the dashboard says "velocity: 12/week" there must be a query
   path back to the Shopify orders that produced that number.

6. **No premature features.**
   Don't build tables, endpoints, or UI for things that aren't
   being used today. Build them when they're needed.

7. **Schema matches business reality.**
   Column names should be words Reuven uses. "MP" not "product_entity".
   "FOB" not "unit_cost_pretax". "Half Canvas" not "product_type_002".

## What needs to happen (priority order)

### Phase 1: Real data (make it work)

- [ ] Get sync working end-to-end (verified on live site)
- [ ] Validate matched count jumps from 26 to 200+
- [ ] Store styles with images and inventory
- [ ] Add store_inventory table (per-store stock from Shopify locations)
- [ ] Add sales table (historical orders)
- [ ] Dashboard shows real numbers: total inventory, revenue, velocity
- [ ] Products page shows real images, real stock, real velocity

### Phase 2: Operations (make it useful)

- [ ] PO creation with real MP data auto-populated
- [ ] PO stage tracking works end-to-end
- [ ] Cash flow shows real payment schedule vs real revenue
- [ ] Stock alerts: out of stock, low stock, reorder needed
- [ ] Register webhooks for real-time updates

### Phase 3: Intelligence (make it smart)

- [ ] Reorder suggestions based on velocity + lead time + MOQ
- [ ] Store allocation suggestions based on store velocity
- [ ] Vendor scoring from PO performance
- [ ] Grade assignment based on sales data (A/B/C/D)
- [ ] Seasonal velocity adjustment from historical data (not hardcoded)

### Phase 4: Security + reliability (make it solid)

- [ ] Authentication (at minimum: site password, ideally: user accounts)
- [ ] Structured logging (every sync, every webhook, every error)
- [ ] CI tests on every push
- [ ] Daily reconciliation sync (scheduled function)
- [ ] Error alerting

## What this is NOT

- Not a WMS (we don't manage warehouse bins)
- Not an accounting system (QuickBooks does that)
- Not a CRM (Shopify handles customer data)
- Not a POS (Shopify POS handles transactions)

We sit on top of these systems and connect the dots.
The value is in the connections, not the transactions.
