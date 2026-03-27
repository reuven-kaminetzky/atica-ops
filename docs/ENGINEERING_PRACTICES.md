# Engineering Practices

## How we build from here

This document defines how we work. Every session, every commit,
every feature follows these practices. No exceptions.

---

## 1. Design before code

Before writing any feature:
- Write a one-paragraph description of what it does
- Define the data contract (what goes in, what comes out)
- Identify which domain module owns it
- Identify which DAL methods are needed
- Identify which pages/actions consume it

Don't start coding until the design is clear.

**Example — bad:** "Let me add styles to the sync real quick"
**Example — good:**
```
Feature: Style sync
Input: Shopify products (from getProducts API)
Output: Style records in styles table
Owner: product domain (lib/product/)
DAL method: products.upsertStyleBatch(styles[])
Consumer: product detail page, product list cards
Constraint: Must complete within Netlify function timeout (26s)
Strategy: Batch INSERT using unnest(), not individual queries
```

---

## 2. One commit, one purpose

Each commit does ONE thing. It should be describable in one sentence.

**Good:** "Add styles table migration"
**Good:** "Update sync to create style records"
**Bad:** "ARCHITECTURE: decouple from Shopify, fix routing, add ports" (33 files)

If a commit touches more than 5 files, ask: should this be multiple commits?

---

## 3. Test before push

Before every push:
1. `node --check` on every changed .js file
2. `node test.js` passes
3. `npx next build` succeeds
4. Manually verify the feature works locally if possible
5. If it touches the sync/webhook/API: verify the response shape

Don't push code that you haven't verified works.

---

## 4. Schema changes are planned

Never add a table reactively. Schema changes follow this process:

1. Write the migration SQL
2. Document WHY this table exists and what business question it answers
3. Write the DAL methods that use it
4. Write tests for the DAL methods
5. Add the migration to the ordered list
6. Push

**Migration naming:** `NNN_descriptive_name.sql` (e.g., `007_sales_table.sql`)

**Tables we have that shouldn't exist yet:**
- campaigns (no marketing module)
- wholesale_accounts (no wholesale module)
- components / mp_components (not using component tracking)
- attachments (no file management)
- bin_locations (no warehouse management)
- external_connections / external_events (premature)

These should be removed in a cleanup migration to keep the schema honest.

---

## 5. Background jobs done right

Netlify constraints:
- Serverless functions: 26 second timeout (Pro plan)
- Background functions: 15 minute timeout, return 202 immediately
- Scheduled functions: 30 second execution limit

**Pattern for long-running work:**

```
User clicks button
  → API route validates request, returns 202 + job ID
  → Triggers background function
  → Background function does the work
  → Stores result in app_settings or a jobs table
  → User polls /api/jobs/:id for status

OR:
  → Background function does the work
  → Logs structured JSON
  → Verification endpoint confirms the result
```

**Don't:** Try to squeeze 40 seconds of work into a 26-second function.
**Don't:** Rewrite the sync route 5 times to shave seconds.
**Do:** Use background functions for anything that takes more than 15 seconds.

---

## 6. Data flow architecture

```
Shopify (source of truth)
    │
    ├── Initial sync (background function, runs once)
    │   └── Fetches products, inventory, orders
    │       └── Writes to: master_products, styles, sales, store_inventory
    │
    ├── Webhooks (real-time, per-event)
    │   ├── orders/create → deduct stock, record sale
    │   ├── inventory_levels/update → update stock
    │   └── products/update → update hero image
    │
    └── Daily reconciliation (scheduled background function)
        └── Full re-sync + verification
            └── Catches anything webhooks missed

Domain Layer (computes intelligence)
    │
    ├── Velocity = sales / weeks (from sales table)
    ├── Days of stock = inventory / (velocity / 7)
    ├── Reorder qty = (target weeks × velocity) - stock - incoming
    ├── Signal = hot/rising/steady/slow (from sell-through + velocity)
    └── Cash flow = PO payments schedule vs revenue projection

Pages (display trusted numbers)
    │
    ├── Dashboard → operational summary
    ├── Products → MP list with images, stock, velocity
    ├── Product detail → styles grid, stack, POs
    ├── Stock → reorder suggestions with cost impact
    ├── PO list → pipeline by stage
    ├── Cash flow → weekly outflow projection
    └── Settings → sync, verify, webhooks
```

---

## 7. Error handling

Every async operation has explicit error handling.
No silent catches. No `catch (e) { /* skip */ }`.

**Pattern:**
```javascript
try {
  const result = await doThing();
  log.info('thing.done', { result });
  return result;
} catch (e) {
  log.error('thing.failed', { error: e.message, context: relevantData });
  throw e; // or return { error: e.message }
}
```

---

## 8. What we build next

Priority order, one at a time, properly:

### Next: Fix the sync properly
- Background function for initial full sync
- Batch INSERT for styles (unnest pattern, not one-by-one)
- Test the background function locally before pushing
- Verify with the verification endpoint

### Then: Clean up the schema
- Remove premature tables (campaigns, wholesale, components, etc.)
- Remove premature columns (external_connections, external_events)
- Single cleanup migration

### Then: Integration tests
- Test that syncs products from Shopify and creates style records
- Test that PO creation generates payment schedule
- Test that webhook updates stock correctly
- These tests can run against the real Neon database in a test schema

### Then: Staging environment
- Branch deploys on Netlify (dev branch → staging URL)
- All changes go through staging first
- Only merge to main after staging verification

---

## What this is NOT

This is not a document about what features to build.
This is about HOW we build them.
The features are defined in FOUNDATION.md.
The engineering practices are defined here.
