# CLAUDE.md — Atica Ops ERP

> For Claude Code (Shendrao-san). Read before touching anything.
> Updated: March 26, 2026 — Session 3, post-architecture overhaul

## What This Is

Menswear retail operations platform. Static HTML + Netlify Functions, no build step. Connected to Shopify Plus (atica-brand.myshopify.com, API 2025-04). Manages Master Products, Purchase Orders, inventory across 5 stores, cash flow, production planning.

- **V2 URL:** https://atica-ops.netlify.app/v2 (modular — the future)
- **V1 URL:** https://atica-ops.netlify.app/atica_app.html (14K-line monolith — legacy)
- **Repo:** github.com/reuven-kaminetzky/atica-ops
- **Netlify Site:** 367deff9-b1d5-4b2d-80a1-699bcaad7836

## Shopify Connection (LIVE)

```
Shop:       Atica Man
Domain:     aticaman.com
Plan:       Shopify Plus
Store URL:  atica-brand.myshopify.com
API:        2025-04
Token:      shpat_... (in Netlify env vars)
```

Auto-detection in lib/shopify.js tries 3 stores × 6 API versions. Caches resolved connection 10 min.

## Three-Layer Domain Architecture

```
┌──────────────────────────────────────────────────────────┐
│  LAYER 1: lib/domain.js (451 lines) — THE SCHEMAS        │
│  MP_LIFECYCLE (14 stages), PO_LIFECYCLE (12 stages),     │
│  PAYMENT_TYPES, FACTORY_PACKAGE_SECTIONS (9),            │
│  ENTITY_RELATIONS, CASH_FLOW_CONFIG, MP_STATUS_RULES,    │
│  DOMAIN_EVENTS (15 typed events with data contracts)     │
├──────────────────────────────────────────────────────────┤
│  LAYER 2: lib/workflow.js (200 lines) — THE COMPUTE      │
│  computeMPStatus(), buildFactoryPackage(),               │
│  projectCashFlow()                                       │
├──────────────────────────────────────────────────────────┤
│  LAYER 3: lib/effects.js (336 lines) — THE SIDE EFFECTS  │
│  onPOStageAdvanced() → {actions[], logs[]}               │
│  onMPStageAdvanced() → triggers                          │
│  generatePaymentSchedule() → payments[] for a PO         │
│  refreshPaymentStatuses() → planned→upcoming→due→overdue │
│  executeAction() → commits actions to store              │
│  Pure: effect(ctx) → {actions[], logs[]}                 │
│  Caller decides whether to commit.                       │
└──────────────────────────────────────────────────────────┘
```

**Rule: domain.js is read-only schema. workflow.js computes. effects.js reacts. Functions orchestrate.**

## Data Flow

```
MP seed (lib/products.js) → matchAll() → Shopify products
  ↓ computeMPStatus() → unified health
  ↓
PO created (store.po) → generatePaymentSchedule() → payments[]
  ↓ onPOStageAdvanced() → side effects:
  │   Ordered → mp:advance-to-po-created
  │   In Transit → shipment:auto-create
  │   Received → inventory:update + distribution:suggest
  ↓
Cash Flow (computed, never stored)
  ← PO payments (planned outflow)
  ← Shopify orders (actual inflow)
  → projectCashFlow() → 3-month projection
```

## Codebase — 8,771 lines of modular code

```
lib/           2,288 lines — 12 shared modules
functions/     2,868 lines — 12 Netlify functions, 65 routes
modules/       2,639 lines — 11 frontend modules + sidebar
shell+css        976 lines — v2 shell, modal, mobile, forms
```

## File Map

### lib/ — Shared Backend (imported by every function)
```
domain.js        451  # THREE-LAYER: schemas, stages, entity relations, events
effects.js       336  # THREE-LAYER: side effects engine (PO→shipment, payments)
products.js      319  # 40 MP seeds, matchers, seasonal, demand, distribution
shopify/mappers.js 271 # Product/order/SKU transforms
shopify.js       230  # Shopify client — auto-detect store+version
workflow.js      200  # THREE-LAYER: computeMPStatus, buildFactoryPackage, projectCashFlow
handler.js       140  # DRY handler factory + validate + RouteError
store.js          91  # Netlify Blobs: po, shipments, plm, stack, snapshots, settings
locations.js      74  # Store name normalization
cache.js          59  # In-memory TTL cache
shopify/analytics.js 57 # Velocity, sales rollups
auth.js           48  # CORS, JSON, auth (SKIP_AUTH=true)
mappers.js         9  # Proxy → shopify/mappers
analytics.js       3  # Proxy → shopify/analytics
```

### netlify/functions/ — API Layer
```
products.js       856  # 17 routes: masters, reorder, stock, PLM, stack CRUD, factory package, sku-map
purchase-orders.js 371 # 9 routes: CRUD + stage gates + auto-payments + side effects
finance.js        312  # 3 routes: projection, margins, AP
workflow.js       265  # 6 routes: unified status, stack defs, cashflow, health
orders.js         231  # 6 routes: list, sync, velocity, sales, mp-velocity, drafts
customers.js      193  # 4 routes: list, detail, top, segments
shipments.js      143  # 5 routes: CRUD + arrive
pos.js            133  # 3 routes: today, by-location, feed
webhooks-shopify.js 129 # HMAC verification
inventory.js       87  # 4 routes: list, sync, adjust, transfer
status.js          82  # 4 routes: connection, cache, webhooks
ledger.js          66  # 3 routes: entries, snapshot, snapshots
```

### modules/ — V2 Frontend (ES modules, init/destroy lifecycle)
```
cash-flow.js     791  # Overview, PO CRUD/edit/advance, Production (reorder), Ledger tab
marketplace.js   311  # MP cards, category tabs, detail modal, Quick PO + Full Form
stock.js         282  # By Product, By Store matrix, Locations
analytics.js     206  # Revenue chart, category bars, MP velocity+signals, 7/30/90d
vendors.js       188  # Vendor cards, MP product lines, PO rollup
core.js          183  # API client (15s timeout), module loader, formatters
settings.js      164  # Shopify status, sync, cache, webhooks
ledger.js        118  # Financial entries with day range
pos.js           117  # Today's sales, feed
home.js          110  # Tiles + system health summary (workflow/health)
event-bus.js      86  # Pub/sub with typed events
sidebar.js        83  # Odoo-style nav with section groups
```

## Priority Stack

1. **MPs** — with correct Shopify styles, full product stack lifecycle. THE ROOT.
2. **POs** — 12 stages with gates, side effects, auto-payment generation. THE TRUNK.
3. **Cash flow** — tied to POs (costs) and Shopify orders (revenue).
4. **Production planning** — reorder plan with seasonal velocity + demand signals.
5. **Analytics** — from real order data, aggregated by MP.

**No KPIs. No vanity metrics.** Odoo style — functional tiles, real data.

## Product Hierarchy

```
Master Product (MP) → Style (color/fabric) → Fit → Size → Length
```

Suits: Lorenzo 6/4, Alexander 4/2. Shirts: Modern, Contemporary, Classic. Pants: Slim, Regular, Relaxed.
Title matchers in lib/products.js. HC360 vs HC480 split at $400 max variant price.

## Business Logic (in lib/products.js)

```javascript
adjustVelocity(baseVelocity, month)     // 0.85x spring → 1.6x holiday
classifyDemand(sellThrough, velPerWeek)  // hot/rising/steady/slow/stockout
suggestDistribution(totalUnits)          // Lakewood 30%, Flatbush 20%, CH 15%, Monsey 25%, Online 10%
landedCost(fob, dutyPct, freightPct)     // FOB × (1 + duty + freight)
matchProduct(title)                       // Shopify title → MP seed ID
matchAll(shopifyProducts)                 // bulk matching → { matched, unmatched }
```

### Key Numbers
- $4.3M annual revenue, $1.1M inventory at cost
- 35 products, 91 styles, ~63% average margin
- 14 vendors, 5 wholesale accounts
- OpEx: $25K/month, Target cover: 16-24 weeks

## MP Lifecycle (14 stages — lib/domain.js)

```
Concept → Brief(PD) → Sourcing → Sampling → Sample Review(PD) →
Costing(FIN) → Approved(PD+FIN) → PO Created → Production →
QC(PD) → Shipping → In-Store → Reorder Review(PD+FIN) → End of Life
```

`canCreatePO` is only true from stage 7 (Approved) onward. Each stage has artifacts.

## PO Lifecycle (12 stages — lib/domain.js)

```
Concept → Design(PD) → Sample → Approved(PD) → Costed(FIN) →
Ordered → Production → QC(PD) → Shipped → In Transit →
Received(FIN) → Distribution
```

Side effects fire on: Ordered (→ advance MP), In Transit (→ create shipment), Received (→ update inventory + suggest distribution).

Auto-payment generation: standard (50/50), milestone (30/40/30), net30.

## All 65 Endpoints

### Products (17 routes)
```
GET    /api/products                → All Shopify products (cached 5min)
POST   /api/products/sync           → Force sync from Shopify
GET    /api/products/titles          → Lightweight title list
GET    /api/products/trees           → Style→Fit→Size hierarchy
GET    /api/products/masters         → MPs with live Shopify data + inventory
GET    /api/products/seeds           → Raw MP catalog (no Shopify)
GET    /api/products/reorder         → Production planning: seasonal velocity + demand + POs
GET    /api/products/stock           → MP × Store inventory matrix
GET    /api/products/status          → Derived MP status (developing/inStore/stockout/etc.)
GET    /api/products/plm             → PLM stages for all MPs
PATCH  /api/products/plm/:id         → Advance PLM stage with history
GET    /api/products/stack/:id       → Product stack data (materials, sizing, QC, compliance)
PATCH  /api/products/stack/:id       → Update stack data fields
GET    /api/products/factory-package/:id → Full tech pack for vendor (completeness %)
GET    /api/products/sku-map         → SKU mapping
PATCH  /api/products/sku-map/:sku    → Update SKU mapping
POST   /api/products/sku-map/confirm-all → Confirm all SKU mappings
```

### Purchase Orders (9 routes)
```
GET    /api/purchase-orders          → List all POs
GET    /api/purchase-orders/stages   → Stage definitions from domain model
GET    /api/purchase-orders/:id      → Single PO detail
POST   /api/purchase-orders          → Create (auto-fills from MP seed, auto-gen payments)
PATCH  /api/purchase-orders/:id      → Edit fields
PATCH  /api/purchase-orders/:id/stage → Advance stage (PD/FIN gates + side effects)
POST   /api/purchase-orders/:id/payment → Record a payment
POST   /api/purchase-orders/:id/refresh → Refresh payment statuses
DELETE /api/purchase-orders/:id      → Delete
```

### Finance (3 routes)
```
GET    /api/finance/projection       → 12-week cash flow (PO payments + revenue + opex)
GET    /api/finance/margins          → Per-MP margin analysis (FOB vs retail vs landed)
GET    /api/finance/ap               → Accounts payable (all PO payments with status)
```

### Workflow (6 routes — cross-cutting)
```
GET    /api/workflow/status          → Every MP: phase + POs + stock + velocity + flags + health
GET    /api/workflow/status/:id      → Single MP unified status
GET    /api/workflow/stack           → Product stack phase definitions (build/production/ongoing)
GET    /api/workflow/package/:id     → Factory package summary with completeness
GET    /api/workflow/cashflow        → 3-month P&L (PO payments + revenue run rate)
GET    /api/workflow/health          → System health: active POs, overdue, committed cost
```

### Orders (6), Inventory (4), Customers (4), Shipments (5), POS (3), Ledger (3), Status (4), Webhooks (1)
See functions/ for details. All follow createHandler pattern.

## Endpoint → Module Wiring

| Module | Endpoints Used |
|--------|---------------|
| home | workflow/health, status |
| marketplace | products/masters, products/sync, purchase-orders |
| cash-flow | orders/sales, products/reorder, products/seeds, purchase-orders (CRUD+stages), ledger |
| stock | products/masters, inventory, products/stock |
| analytics | orders/mp-velocity, orders/sales |
| vendors | products/seeds, purchase-orders |
| pos | pos/today, pos/feed |
| ledger | ledger |
| settings | status, status/cache, status/webhooks, products/sync, orders/sync, inventory/sync |

### UNWIRED (backend ready, no module uses them yet)
- `/api/products/stack/:id` + `factory-package/:id` — tech pack CRUD, no UI
- `/api/workflow/*` — status dashboard, no dedicated module
- `/api/finance/*` — projection, margins, AP — no dedicated module
- `/api/customers/*` — 4 endpoints, zero UI
- `/api/shipments/*` — CRUD, zero UI
- `/api/inventory/adjust` + `/transfer` — zero UI
- `/api/pos/by-location` — exists but unused

## Event Bus

| Event | Emitter → Listener |
|-------|-------------------|
| `sync:complete` | settings → 7 modules auto-refresh |
| `nav:change` | sidebar, home → shell |
| `modal:open/close` | any → shell |
| `toast:show` | any → shell |
| `po:created` | cash-flow → vendors |
| `po:updated` | cash-flow → vendors |
| `po:create-from-mp` | marketplace → cash-flow (opens PO form with mpId) |
| `po:received` | cash-flow → stock |

## Persistence

| Data | Storage | Pattern |
|------|---------|---------|
| Products, orders, inventory | Shopify + in-memory cache | `client.getProducts()` → `cache.set()` |
| Purchase orders | `store.po` (Netlify Blobs) | `store.po.get/put/getAll/delete` |
| Shipments | `store.shipments` | same |
| PLM stages | `store.plm` | same |
| Product stack data | `store.stack` | materials, construction, sizing, QC per MP |
| Inventory snapshots | `store.snapshots` | same |
| App settings | `store.settings` | same |

`store.getAll()` reads in parallel batches of 10.

## Cache TTLs

products: 5min, orders: 1min, inventory: 2min, velocity: 3min, pos: 1min, status: 30sec.
`cache.makeKey()` sorts params for deterministic keys.

## Env Vars (Netlify)

```
SHOPIFY_STORE_URL=atica-brand.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...
SHOPIFY_API_VERSION=2025-04
SKIP_AUTH=true
```

## Critical Rules

### Never
- Change domain.js schemas without updating effects.js and workflow.js
- Use `let _data = []` for persistent data — use `lib/store.js`
- Use `parseInt(params.days)` unbounded — use `validate.days(params)`
- Use `fetch()` in modules — use `api.get/post/patch/del` from core.js
- Import between frontend modules — use event bus
- Inline store name matching — use `lib/locations.js`
- `throw new Error()` in handlers — use `RouteError(status, message)`
- Write side effects directly in handlers — use `lib/effects.js`
- Redefine schemas — import from `lib/domain.js`

### Always
- `node --check <file>` before pushing
- `git pull origin main` before working
- Use `createHandler(ROUTES, prefix)` for every function
- Use `validate.days()`, `validate.required()`, `validate.intParam()`
- Add `noClient: true` to routes that don't need Shopify
- Guard event handlers with `if (!_container) return`
- Use effects.js for PO/MP state transitions

## What YOU Should Work On

### High Priority — Wire to Frontend
- [ ] **Product Stack editor** — form in MP detail for editing stack data (materials, construction, sizing, QC). Backend: `GET/PATCH /api/products/stack/:id`
- [ ] **Factory package download** — button in MP detail → `/api/products/factory-package/:id` → rendered/downloadable tech pack
- [ ] **Cash flow projection view** — `/api/finance/projection` → planned vs actual, 12-week chart with PO payment details
- [ ] **Unified status dashboard** — `/api/workflow/status` → every MP with health, flags, PO status in one view
- [ ] **Demand signal badges** on marketplace cards — data is in mp-velocity response (`signal` field)

### Medium Priority
- [ ] Customers module — wire `/api/customers/*` (list, detail+orders, top, segments)
- [ ] Shipments module — wire `/api/shipments/*` (auto-created at PO "In Transit")
- [ ] Inventory transfer form — `/api/inventory/transfer` is ready, stock module has the tab
- [ ] PO payment schedule UI — show payments[] in PO detail, allow marking as paid
- [ ] Distribution suggestion on PO receive — data comes from `suggestDistribution()`

### Do NOT Touch
- `lib/domain.js` — architecture owns this
- `lib/effects.js` — architecture owns this
- `lib/workflow.js` — architecture owns this
- `lib/shopify.js` — auto-detection, working
- `lib/handler.js` — DRY handler factory
- Netlify env vars

### Coordination
- Push to main directly (no branches enforced yet)
- Always pull before working
- `node --check` every file you touch
- Architecture session (Nikita) governs lib/ and system design
- You handle feature implementation and frontend wiring
- Check CONTRIBUTING.md for patterns and anti-patterns

## How to Add a New MP

```bash
# 1. Add seed to MP_SEEDS in lib/products.js
# 2. Add title matcher to TITLE_MATCHERS
# 3. Test:
node -e "const p = require('./lib/products'); console.log(p.matchProduct('Your Title'))"
```

## How to Add a New Function

```javascript
const { createHandler, RouteError, validate } = require('../../lib/handler');
const cache = require('../../lib/cache');

async function myHandler(client, { params, body, pathParams }) {
  const days = validate.days(params);
  return { data: 'result' };
}

const ROUTES = [
  { method: 'GET', path: '', handler: myHandler },
];
exports.handler = createHandler(ROUTES, 'my-endpoint');
```

Then add redirect to netlify.toml before the SPA fallback.

## Testing

```bash
node --check lib/products.js
node --check netlify/functions/orders.js

node -e "
const p = require('./lib/products');
const d = require('./lib/domain');
const w = require('./lib/workflow');
const e = require('./lib/effects');
console.log('MPs:', p.MP_SEEDS.length);
console.log('MP stages:', d.MP_LIFECYCLE.length);
console.log('PO stages:', d.PO_LIFECYCLE.length);
console.log('Events:', Object.keys(d.DOMAIN_EVENTS).length);
console.log('Match:', p.matchProduct('Londoner White Shirt'));
console.log('Seasonal Mar:', p.adjustVelocity(10, 3));
console.log('Demand:', p.classifyDemand(90, 6));
"
```

## Done (do not rebuild)

- [x] Three-layer architecture (domain.js + workflow.js + effects.js)
- [x] Shopify connection (atica-brand.myshopify.com, API 2025-04)
- [x] 65 API routes across 12 functions
- [x] Product stack persistence (store.stack, GET/PATCH endpoints)
- [x] Factory package with completeness score
- [x] PO stage advancement with side effects engine
- [x] Auto-payment generation (standard/milestone/net30)
- [x] Finance endpoints (projection, margins, AP)
- [x] Seasonal multipliers, demand signals, distribution weights
- [x] Reorder plan (20-week cover, seasonal velocity, lead-time urgency)
- [x] Analytics module (velocity, category bars, demand signals, 7/30/90d)
- [x] Vendors module (cards, MP products, PO rollup)
- [x] MP detail with Quick PO + Full Form
- [x] PO detail with stage track, check-ins, edit/save toggle
- [x] Stock matrix (MP × Store grid)
- [x] Home module with system health summary
- [x] CSS design system v2 (Inter font, shadows, table hover, focus rings)
- [x] Mobile sidebar (hamburger + backdrop)
- [x] Dead code removed (1,295 lines: stocky, oauth, TS files)
- [x] Parallel blob reads, cached inventory helper, validation standardized
