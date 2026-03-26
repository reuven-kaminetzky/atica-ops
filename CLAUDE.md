# CLAUDE.md — Atica Ops ERP

> This file is for Claude Code (Shendrao-san). Read it before touching anything.
> Updated: March 26, 2026

## What This Is

Atica Man is a menswear retail operations platform. Static HTML + Netlify Functions, no build step. Connected to Shopify live data (aticaman.myshopify.com). Manages Master Products, Purchase Orders, inventory across 4 retail stores + online, cash flow, and production planning.

- **Live URL:** https://atica-ops.netlify.app/atica_app.html (monolith)
- **V2 URL:** https://atica-ops.netlify.app/v2 (modular — long-term replacement)
- **Repo:** github.com/reuven-kaminetzky/atica-ops
- **Shopify Store:** aticaman.myshopify.com
- **Shopify API Version:** `2025-10` — DO NOT CHANGE without curl-testing first

## Priority Stack — What Matters

1. **MPs (Master Products)** — with correct Shopify styles, full PLM lifecycle. THE ROOT.
2. **Purchase Orders** — stage gates with PD and finance check-ins. THE TRUNK.
3. **Cash flow** — tied to POs (costs) and Shopify orders (revenue).
4. **Production planning** — what to order, when, based on real velocity + inventory.
5. **Analytics** — from real order data, aggregated by MP.

**POS is NOT a priority.** It's just a data feed into cash flow.
**No KPIs. No vanity metrics.** Odoo style — functional tiles, real data.

## What Already Works — Do NOT Rebuild

### Backend (12 Netlify Functions + 9 shared libs)

**lib/products.js** — THE ROOT. 40 MP seeds, 40 title matchers, 10 aliases, 18 PLM stages. `matchAll(shopifyProducts)` maps Shopify products to MPs. HC360/HC480 split at $400. "do not use" excluded. This is canonical — monolith has a copy but this is the source of truth.

**lib/locations.js** — Single source of truth for store names. `normalize()`, `resolveOrderStore()`, `buildLocationMap()`. Stores: Lakewood, Flatbush, Crown Heights, Monsey, Online, Reserve.

**lib/shopify.js** — Shopify API client. 8s request timeout, 25s pagination, 3x retry with backoff, cached `createClient` (5 min). Uses `SHOPIFY_STORE_URL` and `SHOPIFY_ACCESS_TOKEN` env vars only.

**lib/handler.js** — DRY handler factory. Every function uses `createHandler(ROUTES, prefix)`. Handles CORS, auth, routing, path params, body parsing, ETag, `RouteError` → proper HTTP status.

**lib/store.js** — Netlify Blobs persistence. Named stores: `po`, `shipments`, `snapshots`, `settings`. Use this, not `let _data = []`.

**lib/cache.js** — In-memory TTL cache. Each function gets its own esbuild-bundled copy. You CANNOT clear another function's cache. TTLs: products 5m, orders 1m, inventory 2m, pos 1m.

**lib/shopify/mappers.js** — `mapProduct`, `mapOrder`, `mapLineItem`, `mapLedgerEntry`, `mapSKU`, `buildProductTree`. Plain JS (compiled from TS).

**lib/shopify/analytics.js** — `sinceDate`, `buildVelocity`, `buildSalesSummary`. Plain JS.

### Key Endpoints

```
GET  /api/products/masters      → MPs enriched with live Shopify data (styles, inventory, images, margin)
GET  /api/products/seeds        → Raw MP catalog + PLM stages (no Shopify needed)
GET  /api/products/reorder      → Production planning: velocity + inventory + POs = reorder signals
GET  /api/products/stock        → MP × Store inventory matrix
GET  /api/products/trees        → Product tree Style→Fit→Size
GET  /api/orders/mp-velocity    → Velocity by Master Product (production planning)
GET  /api/orders/sales          → Revenue summary with daily breakdown
GET  /api/orders/velocity       → Velocity by individual SKU
POST /api/purchase-orders       → Create PO (with mpId auto-fills from seed)
PATCH /api/purchase-orders/:id/stage → Advance stage (PD/finance check-in gates)
GET  /api/purchase-orders/stages → Stage definitions with gate types
GET  /api/inventory             → All locations + levels
GET  /api/pos/today             → Today's sales by store (location_id resolution)
GET  /api/status                → Shopify connection check
```

### PO Stage Pipeline (12 stages)

```
Concept → Design(PD✓) → Sample → Approved(PD✓) → Costed(FIN✓) →
Ordered → Production → QC(PD✓) → Shipped → In Transit →
Received(FIN✓) → Distribution
```

PD stages require `checkedBy` in request body. FIN stages require `checkedBy`.
Data gates enforce: vendor before Design, FOB+units before Costed, ETD before Shipped, container/vessel before In Transit.

### Frontend V2 (9 modules at /v2)

- **home.js** — Large navigation tiles (no KPIs, no data)
- **marketplace.js** — MP cards from `/api/products/masters`, category tabs, color swatches, click → detail modal with styles/fits/sizes, Quick PO button
- **cash-flow.js** — 4 tabs: Overview (revenue + POs), Purchase Orders (table + create/edit/advance), Production (lead-time reorder plan), Ledger
- **stock.js** — By Product (MP totals), By Store (MP × Location matrix), Locations (raw)
- **vendors.js** — Vendor cards with MP product lines, PO rollup, expandable details
- **analytics.js** — MP velocity, category breakdown bars, daily revenue chart, 7/30/90d toggle
- **pos.js** — Today's sales, feed, by-store (data feed only — not priority)
- **ledger.js** — Financial entries with configurable day range
- **settings.js** — Shopify status, sync controls, cache, webhooks
- **core.js** — API client, module loader, formatters
- **event-bus.js** — Pub/sub with EVENTS registry

**Shell (atica_v2.html):**
- Sidebar: Catalog (Master Products, Stock) → Operations (Cash Flow, Vendors, Analytics) → Finance (Ledger, Sales Feed) → System (Settings)
- Mobile: hamburger toggle, backdrop overlay, auto-close on nav
- Modal system → `emit('modal:open', { title, html, onMount, onClose, wide })`
- Toast notifications → `emit('toast:show', { message, type })`
- Sync indicator → listens to `sync:start/complete/error`

## File Map

```
atica_app.html              # 14K-line monolith — CAREFUL. node --check before any edit.
atica_v2.html               # Modular shell with modal system
components/sidebar.js       # Odoo-style nav
css/base.css                # Design system + modal + form CSS
css/odoo-layout.css         # App shell grid layout

lib/                        # Shared backend — THE FOUNDATION
  products.js               # 40 MP seeds, title matchers, PLM stages, matchAll()
  locations.js              # Store name normalization (single source of truth)
  shopify.js                # Shopify API client
  mappers.js                # Proxy → shopify/mappers.js
  analytics.js              # Proxy → shopify/analytics.js
  handler.js                # DRY handler factory
  cache.js                  # In-memory TTL cache (per-function)
  store.js                  # Netlify Blobs (po, shipments, snapshots, settings)
  auth.js                   # CORS, JSON response, authentication
  shopify/mappers.js        # Compiled from TS — product/order/SKU transforms
  shopify/analytics.js      # Compiled from TS — velocity, sales rollups
  shopify/*.ts              # Type reference only — NOT used at runtime

netlify/functions/          # 12 Netlify Functions
  products.js               # masters, seeds, reorder, trees, sync, titles, sku-map
  orders.js                 # list, sync, velocity, sales, mp-velocity, drafts
  purchase-orders.js        # CRUD + stage advancement with PD/FIN gates
  inventory.js              # list, sync, adjust, transfer
  shipments.js              # CRUD + arrive (Netlify Blobs)
  pos.js                    # today, by-location, feed (location_id resolution)
  ledger.js                 # entries, snapshot, snapshots
  status.js                 # connection, cache, webhooks
  customers.js              # list, detail, top, segments
  webhooks-shopify.js       # HMAC verification, topic logging
  stocky.js                 # Stocky API proxy
  oauth-callback.js         # OAuth token exchange

modules/                    # V2 frontend ES modules
  [11 modules — see above]

docs/ARCHITECTURE.md        # Full system architecture
```

## Critical Rules

### Before ANY push
```bash
node --check <file>   # Every JS file you touch
git pull origin main   # Always pull first
```

### Never
- Change `SHOPIFY_API_VERSION` without curl testing
- Use `let _data = []` for persistent storage — use `lib/store.js`
- Inline store name matching — use `lib/locations.js`
- Inline MP title matching — use `lib/products.js`
- Fetch orders without date filter — default 90 days, max 365
- Throw `new Error()` in handlers — use `RouteError(status, message)`
- Import between frontend modules — use event bus
- Require `.ts` files directly — use `.js` counterparts
- Edit `atica_app.html` without `node --check`

### Always
- Use `createHandler(ROUTES, prefix)` for every Netlify function
- Use `validate.days(params)` for day parameters — never inline `parseInt`
- Use `validate.required(body, ['field1', 'field2'])` for required body fields
- Use `lib/products.js` for MP seeds and matching
- Use `lib/locations.js` for store normalization
- Add `noClient: true` to routes that don't need Shopify client
- Use `emit('modal:open', {...})` for modals — don't build inline overlays
- Use `emit('toast:show', {...})` for notifications

## Product Hierarchy

```
Master Product (MP) → Style (by color/fabric) → Fit → Size → Length
```

- **Suits:** fits = Lorenzo 6, Lorenzo 4, Alexander 4, Alexander 2
- **Shirts:** fits = Modern (Extra Slim), Contemporary (Slim), Classic
- **Pants:** fits = Slim, Regular, Relaxed

Title matchers in `lib/products.js` map Shopify titles to MP seed IDs.
HC360 vs HC480 split at $400 max variant price.

## How to Add a New MP

1. Add seed to `MP_SEEDS` in `lib/products.js`
2. Add title matcher to `TITLE_MATCHERS`
3. If key differs from seed ID, add alias to `ALIASES`
4. Test: `node -e "const p = require('./lib/products'); console.log(p.matchProduct('Your Title'))"`

## How to Add a New Netlify Function

```javascript
const { createHandler, RouteError } = require('../../lib/handler');
const ROUTES = [
  { method: 'GET', path: '', handler: myHandler },
];
exports.handler = createHandler(ROUTES, 'my-endpoint');
```

Then add redirect to `netlify.toml` before the SPA fallback.

## Env Vars (Netlify)

| Variable | Required |
|----------|----------|
| `SHOPIFY_STORE_URL` | Yes — `aticaman.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Yes — `shpat_...` |
| `SKIP_AUTH` | Yes — `true` |
| `STOCKY_API_KEY` | Optional |

## What Needs Work

### High Priority
- [ ] MP PLM stage tracking — persist which PLM stage each MP is at (concept→in-store→reorder review→EOL)
- [ ] MP detail needs size grid — show available sizes per fit per style (the full matrix)
- [ ] Cash-flow overview should show real cost breakdown (PO costs vs revenue, not just revenue)

### Medium Priority
- [ ] Sales pulse backoff in monolith — if syncSalesPulse fails, double interval up to 15 min
- [ ] PO bulk actions — select multiple POs, advance stage, or export
- [ ] Inventory transfer UI — stock module has the tab but no form yet
- [ ] CRM / customer profiles — Shopify order history per customer

### Lower Priority
- [ ] Monolith → v2 migration plan (both run on same backend, v2 is the long-term)
- [ ] Branch protection in GitHub
- [ ] CI test pipeline (endpoint tests exist but DNS blocked from CI)

### Done (do not rebuild)
- [x] Analytics module — MP velocity, category bars, daily revenue chart, 7/30/90d toggle
- [x] PO edit form with Edit/Save toggle (Shendrao-san built this)
- [x] Input validation standardized — validate.days(), validate.required(), validate.intParam()
- [x] Module loader bug fix — destroys CORRECT module on navigation
- [x] Global error boundary — unhandled rejections → toast
- [x] API client timeout (15s) + better Shopify error messages
- [x] Cache key determinism — sorted params
- [x] Settings diagnostics — API version, store URL, connection hints
- [x] Store + API version auto-detection (tries 2 stores × 6 versions)
- [x] MP detail with Quick PO + Full Form shortcuts
- [x] PO detail view with stage track, check-ins, history, stage advancement
- [x] PO edit form — editable fields (vendor, units, FOB, ETD, ETA, container, vessel, notes)
- [x] PO auto-shipment — when PO hits "In Transit", auto-creates shipment in Blobs
- [x] Reorder plan cross-references active POs + lead-time urgency
- [x] Inventory by MP per location — stock matrix (Product × Store grid)
- [x] Vendor management view — MPs grouped by vendor, PO rollup, product chips
- [x] Modal system (modal:open with onMount callback for form binding)
- [x] PO creation form with MP dropdown and seed auto-fill
- [x] Mobile sidebar toggle (hamburger + backdrop + auto-close on nav)
- [x] API version configurable via SHOPIFY_API_VERSION env var

## Testing

```bash
node --check lib/products.js
node --check netlify/functions/orders.js

node -e "
const p = require('./lib/products');
const m = require('./lib/mappers');
const a = require('./lib/analytics');
const l = require('./lib/locations');
console.log('MPs:', p.MP_SEEDS.length);
console.log('Match:', p.matchProduct('Londoner White Shirt'));
console.log('Location:', l.normalize('crown heights'));
"
```

## Coordination

This repo is shared between multiple Claude sessions. Push to main directly (no branch protection enforced yet). Always pull before working. The architecture session (Nikita) governs lib/ and overall system design. Shendrao-san (Claude Code) handles feature implementation. If you're unsure about a pattern, check `docs/ARCHITECTURE.md`.
