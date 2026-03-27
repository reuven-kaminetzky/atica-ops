# CLAUDE.md — Atica Ops ERP

> For Claude Code (Shendrao-san). Read before touching anything.
> Updated: March 26, 2026 — Session 3, post-architecture

## What This Is

Menswear retail ERP. Static HTML + Netlify Functions, no build step. Connected to Shopify live data. Manages Master Products, Purchase Orders, inventory (4 stores + online), cash flow, production planning.

| Key | Value |
|-----|-------|
| **V2 URL** | https://atica-ops.netlify.app/v2 |
| **Monolith** | https://atica-ops.netlify.app/atica_app.html (14K lines, legacy) |
| **Repo** | github.com/reuven-kaminetzky/atica-ops |
| **Shopify** | atica-brand.myshopify.com · Shopify Plus · API 2025-04 · **CONNECTED** |
| **Netlify** | Site ID 367deff9-b1d5-4b2d-80a1-699bcaad7836 |

## Three-Layer Architecture

```
LAYER 1: lib/domain.js (451 lines) — SCHEMAS
  What things ARE. Stages, relationships, event contracts.

LAYER 2: lib/workflow.js (200 lines) — COMPUTE
  How things WORK. Pure functions, no side effects.

LAYER 3: lib/effects.js (336 lines) — SIDE EFFECTS
  What HAPPENS when state changes. Returns actions for caller to execute.
```

**Rule: domain.js is read-only reference. workflow.js computes. effects.js reacts. Functions orchestrate.**

## Data Flow

```
MP seed (lib/products.js) → matchAll() → Shopify products
  ↓
PO created (store.po) → generatePaymentSchedule() → payments[]
  ↓
PO stage advanced → onPOStageAdvanced() → side effects
  → shipment:auto-create (at "In Transit")
  → mp:advance (at "Ordered")
  → distribution:suggest (at "Received")
  ↓
Cash Flow (computed) ← PO payments (outflow) + Shopify orders (inflow)
  ↓
Analytics ← velocity + demand signals + seasonal multipliers
```

## Codebase Summary

```
lib/           2,288 lines — 12 shared backend modules
functions/     2,868 lines — 12 Netlify functions, 65 routes
modules/       2,639 lines — 11 frontend modules + sidebar
css/             787 lines — design system + layout
shell            189 lines — atica_v2.html
docs/          1,116 lines — CLAUDE.md, CONTRIBUTING.md, ARCHITECTURE.md
───────────────────────────────
Total modular   9,887 lines (+ 14K monolith)
```

## File Map

### lib/ — Shared Backend

| File | Lines | Purpose |
|------|-------|---------|
| domain.js | 451 | MP lifecycle (14), PO lifecycle (12), payment types, factory package (9 sections), entity relations, cash flow config, status rules, 15 domain events |
| effects.js | 336 | onPOStageAdvanced(), onMPStageAdvanced(), generatePaymentSchedule(), refreshPaymentStatuses(), executeAction() |
| products.js | 319 | 40 MP seeds, 40 title matchers, 10 aliases, 18 PLM stages, seasonal multipliers, demand signals, distribution weights, landed cost |
| shopify.js | 230 | Auto-detect client: 3 stores × 6 API versions. Paginated, retries, rate-limit aware |
| workflow.js | 200 | computeMPStatus(), buildFactoryPackage(), projectCashFlow() |
| handler.js | 140 | createHandler(), RouteError, validate (days, required, intParam) |
| store.js | 91 | 6 blob stores: po, shipments, plm, stack, snapshots, settings. Parallel batch reads |
| locations.js | 74 | Store name normalization |
| cache.js | 59 | In-memory TTL cache with deterministic keys |
| auth.js | 48 | CORS, JSON response, authenticate (SKIP_AUTH=true) |

### netlify/functions/ — API Layer

| Function | Routes | Lines | Purpose |
|----------|--------|-------|---------|
| products | 17 | 856 | masters, seeds, reorder, stock, PLM, stack CRUD, factory-package, trees, titles, sku-map, status |
| purchase-orders | 9 | 371 | CRUD + stage gates + auto-payments + side effects + payment recording |
| finance | 3 | 312 | 12-week projection, margin analysis, accounts payable |
| workflow | 6 | 265 | unified MP status, stack definitions, factory package summary, cashflow, health |
| orders | 6 | 231 | list, sync, velocity, sales, mp-velocity (with demand signals), drafts |
| customers | 4 | 193 | list, detail+orders, top spenders, segments |
| shipments | 5 | 143 | CRUD + arrive (auto-created on PO "In Transit") |
| pos | 3 | 133 | today, by-location, feed |
| webhooks-shopify | 1 | 129 | HMAC verified |
| inventory | 4 | 87 | list, sync, adjust, transfer |
| status | 4 | 82 | connection check, cache stats, cache clear, webhook registration |
| ledger | 3 | 66 | entries, snapshot, snapshots |

### modules/ — Frontend

| Module | Lines | Endpoints Used | Status |
|--------|-------|---------------|--------|
| cash-flow | 791 | orders/sales, products/reorder+seeds, purchase-orders, ledger | **WIRED** |
| marketplace | 311 | products/masters+sync, purchase-orders | **WIRED** |
| stock | 282 | products/masters+stock, inventory | **WIRED** |
| analytics | 206 | orders/mp-velocity+sales | **WIRED** |
| vendors | 188 | products/seeds, purchase-orders | **WIRED** |
| core | 183 | (api client, formatters, module loader) | **INFRA** |
| settings | 164 | status, cache, sync, webhooks | **WIRED** |
| ledger | 118 | ledger | **WIRED** |
| pos | 117 | pos/today+feed | **WIRED** |
| home | 103 | status, workflow/health | **WIRED** |
| event-bus | 86 | (pub/sub) | **INFRA** |

## Key Endpoints

### Products (the root)
```
GET  /api/products/masters            → MPs + live Shopify styles, inventory, images
GET  /api/products/seeds              → Raw MP catalog (no Shopify needed)
GET  /api/products/reorder            → Production planning: seasonal velocity + inventory + POs + demand signals + distribution
GET  /api/products/stock              → MP × Store inventory matrix
GET  /api/products/status             → Derived status for all MPs (developing/onOrder/inStore/stockout/etc.)
GET  /api/products/plm                → PLM stages for all MPs
PATCH /api/products/plm/:id           → Advance PLM stage with history
GET  /api/products/stack/:id          → Product stack data (materials, construction, sizing, QC, compliance, content)
PATCH /api/products/stack/:id         → Update stack data fields
GET  /api/products/factory-package/:id → Full vendor tech pack (seed + stack + PO merged, completeness %)
GET  /api/products/trees              → Style→Fit→Size hierarchy
```

### Purchase Orders
```
POST  /api/purchase-orders            → Create (auto-fills from MP seed, auto-generates payment schedule)
GET   /api/purchase-orders            → List all (sorted by creation date)
GET   /api/purchase-orders/:id        → Single PO detail
PATCH /api/purchase-orders/:id        → Edit fields
PATCH /api/purchase-orders/:id/stage  → Advance stage (PD/Finance gates, fires side effects)
POST  /api/purchase-orders/:id/payment → Record a payment
POST  /api/purchase-orders/:id/refresh → Refresh payment statuses (planned→upcoming→due→overdue)
DELETE /api/purchase-orders/:id       → Delete
GET   /api/purchase-orders/stages     → Stage definitions
```

### Finance
```
GET  /api/finance/projection          → 12-week cash flow (PO payments + Shopify revenue + opex)
GET  /api/finance/margins             → Per-MP margin analysis (FOB vs retail vs landed)
GET  /api/finance/ap                  → Accounts payable (all PO payments with status)
```

### Workflow (cross-cutting)
```
GET  /api/workflow/status             → Every MP: phase + POs + stock + velocity + flags + health
GET  /api/workflow/status/:id         → Single MP unified status
GET  /api/workflow/stack              → MP lifecycle (14 build) + PO lifecycle (12 stages) definitions
GET  /api/workflow/package/:id        → Factory package summary with completeness
GET  /api/workflow/cashflow           → 3-month P&L projection
GET  /api/workflow/health             → System health: active POs, overdue, committed cost
```

### Orders / Analytics
```
GET  /api/orders/mp-velocity          → Per-MP: units, revenue, velocity/week, seasonal adjusted, demand signal
GET  /api/orders/sales                → Revenue summary + daily breakdown
```

### Other
```
GET  /api/customers, /top, /segments, /:id     → UNWIRED — needs UI module
GET  /api/shipments, /:id, POST, PATCH, /arrive → UNWIRED — needs UI module
POST /api/inventory/adjust, /transfer           → UNWIRED — needs form in stock module
GET  /api/pos/today, /by-location, /feed        → Wired to pos module
GET  /api/status                                → Connection + API version
```

## Event Bus

| Event | Emitter | Listener |
|-------|---------|----------|
| sync:complete | settings | ALL modules (refresh data) |
| nav:change | sidebar, home | shell (switch module) |
| modal:open/close | any | shell (show/hide modal) |
| toast:show | any | shell (show toast) |
| po:created | cash-flow | vendors |
| po:updated | cash-flow | vendors |
| po:create-from-mp | marketplace | cash-flow (opens PO form with mpId) |
| po:received | cash-flow | stock |
| stock:updated | stock | pos |

## Persistence (6 Blob Stores)

| Store | Key pattern | What's in it |
|-------|------------|--------------|
| store.po | PO-2603-XXXX | Purchase orders with payments[], history[], checkIns |
| store.shipments | SHIP-XXXX | Auto-created at PO "In Transit" |
| store.plm | {mpId} | PLM stage, history, updatedBy |
| store.stack | {mpId} | Tech pack data: materials, construction, sizing, QC, compliance, content |
| store.snapshots | {date} | Inventory snapshots |
| store.settings | {key} | App configuration |

## Business Logic

### Seasonal Multipliers (adjustVelocity)
```
Spring: 0.85x  |  BTS (Aug-Sep): 1.4x  |  Fall: 1.15x  |  Holiday (Nov-Dec): 1.6x
```
Reorder plan uses adjusted velocity. Analytics shows seasonal multiplier.

### Demand Signals (classifyDemand)
```
Hot: sell-through ≥85% + velocity ≥5/wk | Rising: ≥70% + ≥3/wk
Slow: <40% + <2/wk | Stockout: zero stock + active demand | Steady: everything else
```

### Distribution Weights
```
Lakewood: 30%  |  Flatbush: 20%  |  Crown Heights: 15%  |  Monsey: 25%  |  Online: 10%
```

### PO Payment Terms
```
Standard: 50% deposit (7 days), 50% on shipment
Milestone: 30% deposit, 40% production, 30% shipment  
Net30: 100% at 30 days after shipment
```
Auto-generated on PO creation. Includes freight+duty estimates.

### Key Numbers
$4.3M revenue, $1.1M inventory, 35 MPs, 91 styles, 63% margin, 14 vendors, $25K/mo opex, 16-24 week target cover.

## Critical Rules

### Before ANY push
```bash
node --check <file>     # Every JS file you touched
git pull origin main     # Always pull first
```

### Never
- Use `let _data = []` for persistent data → use `store.*.put()`
- Use `parseInt(params.days)` → use `validate.days(params)`
- Use `fetch()` in modules → use `api.get/post/patch/del` from core.js
- Import between frontend modules → use event bus
- Redefine domain schemas → import from `lib/domain.js`
- Write side effects in compute functions → return actions from `lib/effects.js`
- Inline store names → use `lib/locations.js`
- `throw new Error()` in handlers → use `RouteError(status, msg)`

### Always
- Use `createHandler(ROUTES, prefix)` for every function
- Use `validate.*` for all user inputs
- Guard event handlers with `if (!_container) return`
- Add `noClient: true` to routes that don't need Shopify
- Use `fetchAllInventory(client)` in products.js (not inline loops)

## Your Work Queue (Shendrao-san)

### HIGH — Wire Workflow to Frontend

1. **Product Stack UI** — New module or tab in marketplace
   - Show each MP's build phase (from `/api/workflow/status`)
   - Form to edit stack data (`PATCH /api/products/stack/:id`)
   - Completeness indicator per MP
   - "Download Factory Package" button → `/api/products/factory-package/:id`

2. **Cash Flow Projection** — New tab in cash-flow module
   - Wire `/api/finance/projection` for 12-week forward view
   - Show PO payments (planned vs actual outflow)
   - Show revenue (projected vs actual inflow)
   - Wire `/api/finance/ap` for payment due dates

3. **Unified Status Dashboard** — New module or home enhancement
   - Wire `/api/workflow/status` for command-center view
   - Each MP: health badge (healthy/attention/warning/critical)
   - Flags: stockout, reorder-needed, qc-issue, payment-overdue
   - Click → drill into MP detail

### MEDIUM — Wire Existing Endpoints

4. **Customers module** — `modules/customers.js` (new file)
   - Wire `/api/customers` (list), `/api/customers/top`, `/api/customers/segments`, `/api/customers/:id`
   - Show customer list with order history, LTV
   - Segment breakdown

5. **Shipments module** — `modules/shipments.js` (new file)
   - Wire `/api/shipments` (list), CRUD
   - Auto-created when PO hits "In Transit"
   - Show ETD/ETA, container, vessel

6. **Inventory transfer form** — In stock module
   - Wire `/api/inventory/transfer`
   - From store → to store, product, quantity

### COORDINATION RULES

- **Don't touch**: `lib/domain.js`, `lib/workflow.js`, `lib/effects.js`, `lib/products.js`, `lib/handler.js` — Architecture session owns these
- **Safe to touch**: All `modules/*.js`, `css/*.css`, `atica_v2.html`, `components/sidebar.js`
- **Shared files** (pull before editing): `netlify/functions/products.js`, `netlify/functions/purchase-orders.js`
- **Your files**: Any new module you create, any CSS additions
- **Always pull** before working. Always `node --check` before pushing.

## How to Add a New Module

```javascript
// modules/my-module.js
import { on, emit } from './event-bus.js';
import { api, formatCurrency, skeleton } from './core.js';

let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `<div id="my-content">${skeleton(6)}</div>`;
  const data = await api.get('/api/my-endpoint');
  // render...
}

export function destroy() { _container = null; }

// Top-level event listeners (guarded)
on('sync:complete', async () => { if (!_container) return; /* refresh */ });
```

Then add to `components/sidebar.js` and wire the route in `atica_v2.html`.

## How to Add a New MP

```bash
# 1. Add seed to MP_SEEDS in lib/products.js
# 2. Add title matcher to TITLE_MATCHERS
# 3. If key differs from seed ID, add alias to ALIASES
# 4. Test:
node -e "const p = require('./lib/products'); console.log(p.matchProduct('Your Title'))"
```

## Env Vars (Netlify)

| Variable | Value |
|----------|-------|
| SHOPIFY_STORE_URL | atica-brand.myshopify.com |
| SHOPIFY_ACCESS_TOKEN | (set in Netlify — do not commit) |
| SHOPIFY_API_VERSION | 2025-04 |
| SKIP_AUTH | true |

## Testing

```bash
# Validate all files
for f in lib/*.js netlify/functions/*.js; do node --check "$f"; done

# Test domain model
node -e "
const d = require('./lib/domain');
const w = require('./lib/workflow');
const e = require('./lib/effects');
const p = require('./lib/products');
console.log('Domain:', Object.keys(d).length, 'exports');
console.log('Workflow:', Object.keys(w).length, 'exports');
console.log('Effects:', Object.keys(e).length, 'exports');
console.log('MPs:', p.MP_SEEDS.length);
console.log('Match:', p.matchProduct('Londoner White'));
console.log('Season Mar:', p.getSeasonalMultiplier(3));
"
```
