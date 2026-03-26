# CLAUDE.md — Atica Ops ERP

> This file is for Claude Code (Shendrao-san). Read it before touching anything.
> Updated: March 26, 2026 — Session 3

## What This Is

Atica Man is a menswear retail operations platform. Static HTML + Netlify Functions, no build step. Connected to Shopify live data. Manages Master Products, Purchase Orders, inventory across 4 retail stores + online, cash flow, and production planning.

- **Live URL:** https://atica-ops.netlify.app/atica_app.html (monolith, 14K lines)
- **V2 URL:** https://atica-ops.netlify.app/v2 (modular — the future)
- **Repo:** github.com/reuven-kaminetzky/atica-ops
- **Shopify Store:** auto-detected (tries aticaman.myshopify.com + atica-brand.myshopify.com)
- **Shopify API Version:** auto-detected (tries 2025-04, 2025-01, 2024-10, 2025-07, 2025-10, 2026-01)

## Priority Stack — What Matters

1. **MPs (Master Products)** — with correct Shopify styles, full PLM lifecycle. THE ROOT.
2. **Purchase Orders** — 12 stages with PD and finance check-in gates. THE TRUNK.
3. **Cash flow** — tied to POs (costs) and Shopify orders (revenue).
4. **Production planning** — what to order, when, based on velocity + inventory + lead time.
5. **Analytics** — from real order data, aggregated by MP.

**POS is NOT a priority.** Renamed to "Sales Feed" — just a data feed into cash flow.
**No KPIs. No vanity metrics.** Odoo style — functional tiles, real data.

## Codebase Overview

```
7,600 lines of modular code across 37 files

lib/           1,237 lines — 9 shared backend modules (THE FOUNDATION)
functions/     2,034 lines — 12 Netlify functions (API layer)
modules/       2,551 lines — 11 frontend modules + sidebar
shell+css      1,018 lines — v2 shell, modal, mobile, forms
docs             758 lines — this file, ARCHITECTURE.md, CONTRIBUTING.md
```

## File Map

```
atica_app.html              # 14K-line monolith — node --check before any edit
atica_v2.html               # Modular shell: sidebar, modal, toast, mobile hamburger
components/sidebar.js       # Odoo-style nav with section groups
css/base.css                # Design system + modal + form CSS
css/odoo-layout.css         # App shell grid + mobile responsive at 768px

lib/                        # Shared backend — EVERY function imports from here
  products.js               # 40 MP seeds, 40 title matchers, 10 aliases, 18 PLM stages
  locations.js              # Store name normalization (single source of truth)
  shopify.js                # Shopify client — auto-detects store URL + API version
  handler.js                # DRY handler factory + validate helpers + RouteError
  cache.js                  # In-memory TTL cache (deterministic keys)
  store.js                  # Netlify Blobs: po, shipments, snapshots, settings, plm
  auth.js                   # CORS, JSON response, authentication (SKIP_AUTH=true)
  mappers.js                # Proxy → shopify/mappers.js
  analytics.js              # Proxy → shopify/analytics.js
  shopify/mappers.js        # Product/order/SKU transforms (compiled from TS)
  shopify/analytics.js      # Velocity, sales rollups (compiled from TS)

netlify/functions/          # 12 Netlify Functions
  products.js               # masters, seeds, reorder, stock, plm, trees, sync, titles, sku-map
  orders.js                 # list, sync, velocity, sales, mp-velocity, drafts
  purchase-orders.js        # CRUD + stage advancement + auto-shipment on In Transit
  inventory.js              # list, sync, adjust, transfer
  shipments.js              # CRUD + arrive
  pos.js                    # today, by-location, feed
  ledger.js                 # entries, snapshot, snapshots
  status.js                 # connection (shows API version), cache, webhooks
  customers.js              # list, detail, top, segments
  webhooks-shopify.js       # HMAC verification
  stocky.js                 # DEAD CODE — zero references
  oauth-callback.js         # DEAD CODE — zero references

modules/                    # V2 frontend ES modules (init/destroy lifecycle)
  core.js                   # API client (15s timeout), module loader, formatters
  event-bus.js              # Pub/sub with EVENTS registry
  home.js                   # Large navigation tiles (no KPIs)
  marketplace.js            # MP cards, category tabs, detail modal, Quick PO + Full Form
  cash-flow.js              # Overview, POs (create/edit/advance), Production (reorder), Ledger
  stock.js                  # By Product (MP totals), By Store (matrix), Locations
  vendors.js                # Vendor cards with MP product lines, PO rollup
  analytics.js              # Revenue chart, category bars, MP velocity table, 7/30/90d
  pos.js                    # Today's sales, feed (data feed — not priority)
  ledger.js                 # Financial entries with day range
  settings.js               # Shopify status + API version, sync, cache, webhooks

docs/ARCHITECTURE.md        # Full system architecture
CONTRIBUTING.md             # Git workflow + patterns (needs update)
```

## Shell (atica_v2.html)

- **Sidebar:** Catalog (Master Products, Stock) → Operations (Cash Flow, Vendors, Analytics) → Finance (Ledger, Sales Feed) → System (Settings)
- **Mobile:** hamburger toggle, backdrop overlay, auto-close on nav
- **Modal:** `emit('modal:open', { title, html, onMount, onClose, wide })`
- **Toast:** `emit('toast:show', { message, type })`
- **Error boundary:** global unhandled rejection → toast
- **Module loader:** destroys current module before loading new one

## Critical Rules

### Before ANY push
```bash
node --check <file>     # Every JS file you touched
git pull origin main     # Always pull first
```

### Never
- Change Shopify API version manually — it auto-detects now
- Use `let _data = []` for persistent data — use `lib/store.js`
- Use `parseInt(params.days)` unbounded — use `validate.days(params)`
- Use `fetch()` in modules — use `api.get/post/patch/del` from core.js
- Import between frontend modules — use event bus
- Inline store name matching — use `lib/locations.js`
- Inline title matchers — use `lib/products.js`
- Throw `new Error()` in handlers — use `RouteError(status, message)`
- Build modal HTML inline — use `emit('modal:open', {...})`

### Always
- Use `createHandler(ROUTES, prefix)` for every Netlify function
- Use `validate.days(params)` for day parameters
- Use `validate.required(body, ['field1', 'field2'])` for required body fields
- Use `validate.intParam(params, key, {min,max,fallback})` for bounded ints
- Use `lib/products.js` for MP seeds and matching
- Use `lib/locations.js` for store normalization
- Use `fetchAllInventory(client)` in products.js (not inline inventory loops)
- Add `noClient: true` to routes that don't need Shopify client
- Guard event handlers with `if (!_container) return`

## Product Hierarchy

```
Master Product (MP) → Style (by color/fabric) → Fit → Size → Length
```

- **Suits:** Lorenzo 6, Lorenzo 4, Alexander 4, Alexander 2
- **Shirts:** Modern (Extra Slim), Contemporary (Slim), Classic
- **Pants:** Slim, Regular, Relaxed

Title matchers in `lib/products.js` map Shopify titles to MP seed IDs.
HC360 vs HC480 split at $400 max variant price.

## PO Stage Pipeline (12 stages)

```
Concept → Design(PD✓) → Sample → Approved(PD✓) → Costed(FIN✓) →
Ordered → Production → QC(PD✓) → Shipped → In Transit →
Received(FIN✓) → Distribution
```

PD/FIN stages require `checkedBy` in body. Auto-shipment fires at "In Transit".

## PLM Lifecycle (18 stages)

```
Concept → Design Brief → Sampling → Sample Review → Costing →
Cost Approved → Pre-Production → PO Created → Production → QC →
Shipped → In Transit → Customs → Warehouse → Distribution →
In-Store → Reorder Review → End of Life
```

Persisted in Netlify Blobs (`store.plm`). Endpoints: `GET/PATCH /api/products/plm`.

## Key Endpoints

### Products (the root)
```
GET  /api/products/masters        → MPs + live Shopify styles, inventory, images
GET  /api/products/seeds          → Raw MP catalog + PLM stages (no Shopify)
GET  /api/products/reorder        → Production planning: velocity + inventory + POs
GET  /api/products/stock          → MP × Store inventory matrix
GET  /api/products/plm            → PLM stages for all MPs
PATCH /api/products/plm/:id       → Advance PLM stage with history
GET  /api/products/trees          → Style→Fit→Size hierarchy
```

### Orders / Analytics
```
GET  /api/orders/mp-velocity      → Velocity by Master Product
GET  /api/orders/sales            → Revenue summary + daily breakdown
GET  /api/orders/velocity         → Velocity by individual SKU
```

### Purchase Orders
```
POST  /api/purchase-orders        → Create (mpId auto-fills from seed)
GET   /api/purchase-orders        → List all
GET   /api/purchase-orders/:id    → Single PO
PATCH /api/purchase-orders/:id    → Edit fields
PATCH /api/purchase-orders/:id/stage → Advance (PD/FIN gates)
DELETE /api/purchase-orders/:id   → Delete
GET   /api/purchase-orders/stages → Stage definitions
```

### Other
```
GET  /api/inventory               → All locations + levels
POST /api/inventory/adjust        → Adjust stock (UNWIRED to UI)
POST /api/inventory/transfer      → Transfer stock (UNWIRED to UI)
GET  /api/customers/*             → List, detail, top, segments (UNWIRED to UI)
GET  /api/shipments/*             → CRUD (UNWIRED to UI)
GET  /api/pos/today               → Today's sales by store
GET  /api/pos/feed                → Recent transactions
GET  /api/ledger                  → Financial entries
GET  /api/status                  → Connection check + API version
```

## Endpoint → Module Wiring

| Module | Endpoints Used |
|--------|---------------|
| marketplace | products/masters, products/sync, purchase-orders |
| cash-flow | orders/sales, products/reorder, products/seeds, purchase-orders, purchase-orders/stages, ledger |
| stock | products/masters, inventory, products/stock |
| analytics | orders/mp-velocity, orders/sales |
| vendors | products/seeds, purchase-orders |
| pos | pos/today, pos/feed |
| ledger | ledger |
| settings | status, status/cache, status/webhooks, products/sync, orders/sync, inventory/sync |
| home | (none — tiles only) |

**UNWIRED (backend exists, no module uses them):**
- `/api/products/plm` + `plm/:id` — PLM tracking
- `/api/customers/*` — 4 endpoints, zero UI
- `/api/shipments/*` — CRUD, zero UI
- `/api/inventory/adjust` + `/transfer` — zero UI
- `/api/products/sku-map` — zero UI
- `/api/pos/by-location` — exists but pos module doesn't use it

## Event Bus

| Event | Emitter → Listener |
|-------|-------------------|
| `sync:complete` | settings → ALL modules (8 listeners) |
| `nav:change` | sidebar, home → shell |
| `modal:open/close` | any module → shell |
| `toast:show` | any module → shell |
| `po:created` | cash-flow → vendors |
| `po:updated` | cash-flow → vendors |
| `po:create-from-mp` | marketplace → cash-flow (opens PO form with mpId) |
| `po:received` | cash-flow → stock |
| `stock:updated` | stock → pos (stub) |

## Persistence

| Data | Storage | Pattern |
|------|---------|---------|
| Products, orders, inventory | Shopify (source of truth) + in-memory cache | `client.getProducts()` → `cache.set()` |
| Purchase orders | Netlify Blobs (`store.po`) | `store.po.get/put/getAll` |
| Shipments | Netlify Blobs (`store.shipments`) | same |
| PLM stages | Netlify Blobs (`store.plm`) | same |
| Inventory snapshots | Netlify Blobs (`store.snapshots`) | same |
| App settings | Netlify Blobs (`store.settings`) | same |

`store.getAll()` reads in parallel batches of 10 (not sequential).

## Cache

Each function gets its own esbuild-bundled cache copy. TTLs:

| Key | TTL | Notes |
|-----|-----|-------|
| products | 5 min | Products rarely change |
| orders | 1 min | Orders flow in |
| inventory | 2 min | Changes often |
| velocity | 3 min | Aggregated, stable |
| pos | 1 min | Real-time-ish |
| status | 30 sec | Connection check |

`cache.makeKey()` sorts params for deterministic keys.

## Env Vars (Netlify)

| Variable | Required | Notes |
|----------|----------|-------|
| `SHOPIFY_STORE_URL` | Yes | `aticaman.myshopify.com` (fallback to `atica-brand`) |
| `SHOPIFY_ACCESS_TOKEN` | Yes | `shpat_...` |
| `SKIP_AUTH` | Yes | `true` |
| `SHOPIFY_API_VERSION` | Optional | Auto-detected if not set |

## What Needs Work

### High Priority
- [ ] Wire PLM to marketplace detail modal — show current PLM stage, allow advancement
- [ ] MP detail size grid — available sizes per fit per style (full matrix)
- [ ] Cash-flow cost breakdown — PO costs vs revenue, not just revenue total
- [ ] Customers module — wire the 4 existing endpoints to a UI module

### Medium Priority
- [ ] Shipments module — wire CRUD endpoints to a UI (auto-created on PO "In Transit")
- [ ] Inventory transfer form — stock module has the tab placeholder, backend ready
- [ ] PO bulk actions — select multiple, advance stage, or export
- [ ] Sales pulse backoff in monolith

### Lower Priority
- [ ] Monolith → v2 migration plan
- [ ] Remove dead code (stocky.js, oauth-callback.js)
- [ ] Branch protection in GitHub
- [ ] CI test pipeline

### Done (do not rebuild)
- [x] Analytics module — velocity, category bars, daily chart, 7/30/90d
- [x] Vendors module — vendor cards, MP product lines, PO rollup
- [x] MP detail with Quick PO + Full Form
- [x] PO detail with stage track, check-ins, history, advancement
- [x] PO edit form with Edit/Save toggle
- [x] PO auto-shipment on "In Transit"
- [x] Reorder plan with lead-time urgency + active PO cross-reference
- [x] Stock matrix (MP × Store grid)
- [x] Modal system with onMount callback
- [x] Mobile sidebar (hamburger + backdrop)
- [x] Store + API version auto-detection (2 stores × 6 versions)
- [x] Input validation standardized (validate.days, required, intParam)
- [x] Module loader bug fix (destroys correct module)
- [x] Global error boundary
- [x] API client timeout (15s)
- [x] Cache key determinism
- [x] Parallel blob reads (batches of 10)
- [x] Cached inventory helper (shared by reorder + stock)
- [x] PLM endpoint (GET + PATCH with history)
- [x] Settings diagnostics (API version, store URL, hints)

## How to Add a New MP

1. Add seed to `MP_SEEDS` in `lib/products.js`
2. Add title matcher to `TITLE_MATCHERS`
3. If key differs from seed ID, add alias to `ALIASES`
4. Test: `node -e "const p = require('./lib/products'); console.log(p.matchProduct('Your Title'))"`

## How to Add a New Netlify Function

```javascript
const { createHandler, RouteError, validate } = require('../../lib/handler');
const cache = require('../../lib/cache');

async function myHandler(client, { params, body, pathParams }) {
  const days = validate.days(params);
  // ...
  return { data: 'response' };
}

const ROUTES = [
  { method: 'GET', path: '', handler: myHandler },
];
exports.handler = createHandler(ROUTES, 'my-endpoint');
```

Then add to `netlify.toml` before the SPA fallback.

## Testing

```bash
node --check lib/products.js
node --check netlify/functions/orders.js

node -e "
const p = require('./lib/products');
const l = require('./lib/locations');
const h = require('./lib/handler');
console.log('MPs:', p.MP_SEEDS.length);
console.log('Match:', p.matchProduct('Londoner White Shirt'));
console.log('Location:', l.normalize('crown heights'));
console.log('Validate:', Object.keys(h.validate));
"
```

## Coordination

Multiple Claude sessions share this repo. Push to main directly (no branch protection yet). Always pull before working. Architecture session (Nikita) governs lib/ and system design. Shendrao-san handles feature implementation. Check `docs/ARCHITECTURE.md` for patterns.
