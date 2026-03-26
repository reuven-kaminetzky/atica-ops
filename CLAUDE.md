# CLAUDE.md — Atica Ops ERP

> This file is for Claude Code. Read it before touching anything.

## What This Is

Atica Man is a menswear retail operations platform. Static HTML + Netlify Functions, no build step. Connected to Shopify live data (aticaman.myshopify.com). Manages Master Products, Purchase Orders, inventory across 4 retail stores + online, cash flow, and production planning.

- **Live URL:** https://atica-ops.netlify.app/atica_app.html (monolith)
- **V2 URL:** https://atica-ops.netlify.app/v2 (modular — long-term)
- **Repo:** github.com/reuven-kaminetzky/atica-ops
- **Shopify Store:** aticaman.myshopify.com
- **Shopify API Version:** `2024-10` — DO NOT CHANGE without curl-testing first

## Priority Stack — What Matters

1. **MPs (Master Products)** — with correct Shopify styles, full PLM lifecycle. THE ROOT.
2. **Purchase Orders** — stage gates with PD and finance check-ins. THE TRUNK.
3. **Cash flow** — tied to POs (costs) and Shopify orders (revenue).
4. **Production planning** — what to order, when, based on real velocity.
5. **Analytics** — from real order data, aggregated by MP.

**POS is NOT a priority.** It's just a data feed into cash flow.
**No KPIs. No vanity metrics.** Odoo style — functional tiles, real data.

## File Map

```
atica_app.html              # 14K-line monolith — CAREFUL. node --check before any edit.
atica_v2.html               # Modular shell — boots to home, loads ES modules
components/sidebar.js       # Odoo-style nav with event bus integration
css/base.css                # Design system — variables, components
css/odoo-layout.css         # App shell grid layout

lib/                        # Shared backend libraries — THE FOUNDATION
  shopify.js                # Shopify API client (8s timeout, 3x retry, paginated)
  products.js               # 40 MP seeds, title matchers, PLM stages, matchAll()
  locations.js              # Store name normalization (single source of truth)
  mappers.js                # Proxy → shopify/mappers.js
  analytics.js              # Proxy → shopify/analytics.js
  handler.js                # DRY handler factory (auth, CORS, routing, ETag)
  cache.js                  # In-memory TTL cache (per-function, not shared)
  store.js                  # Netlify Blobs (POs, shipments, snapshots, settings)
  auth.js                   # CORS headers, JSON response, authentication
  shopify/mappers.js        # Shopify → Atica transforms (compiled from TS)
  shopify/analytics.js      # Velocity, sales rollups (compiled from TS)
  shopify/*.ts              # Type reference docs — NOT used at runtime

netlify/functions/          # 12 Netlify Functions
  products.js               # /api/products/* — list, sync, titles, trees, masters, seeds
  orders.js                 # /api/orders/* — list, sync, velocity, sales, mp-velocity, drafts
  inventory.js              # /api/inventory/* — list, sync, adjust, transfer
  pos.js                    # /api/pos/* — today, by-location, feed (data feed only)
  ledger.js                 # /api/ledger/* — entries, snapshot, snapshots
  status.js                 # /api/status/* — connection, cache, webhooks
  purchase-orders.js        # /api/purchase-orders/* — CRUD + stage advancement
  shipments.js              # /api/shipments/* — CRUD + arrive (Netlify Blobs)
  customers.js              # /api/customers/* — list, detail, top, segments
  webhooks-shopify.js       # POST /api/webhooks/shopify — HMAC verification
  stocky.js                 # /api/stocky/* — Stocky API proxy
  oauth-callback.js         # OAuth token exchange

modules/                    # V2 frontend ES modules (init/destroy lifecycle)
  core.js                   # API client, module loader, formatters
  event-bus.js              # Pub/sub with EVENTS registry
  home.js                   # Large navigation tiles (no KPIs)
  marketplace.js            # MP cards from /api/products/masters
  cash-flow.js              # Revenue, POs, production velocity, ledger
  pos.js                    # Today's sales, feed, by-store
  stock.js                  # Inventory by location
  ledger.js                 # Financial entries with day range
  settings.js               # Shopify status, sync controls, cache

docs/ARCHITECTURE.md        # Full system architecture (read this too)
```

## Critical Rules

### Before ANY push
```bash
node --check <file>   # Every JS file you touch
git pull origin main   # Always pull first — collisions are common
```

### Never
- Push to main without `node --check` passing on all changed files
- Change `SHOPIFY_API_VERSION` without `curl` testing against the live store
- Use `let _data = []` for persistent storage — use `lib/store.js` (Netlify Blobs)
- Inline store name matching — use `lib/locations.js`
- Fetch all orders without a date filter — default 90 days, max 365
- Throw `new Error()` in handlers — use `RouteError(status, message)`
- Import between frontend modules — use the event bus
- Require `.ts` files directly — use `.js` counterparts or proxy modules

### Always
- Use `createHandler(ROUTES, prefix)` for every Netlify function
- Use `lib/products.js` for MP seeds, title matchers, matching logic
- Use `lib/locations.js` for store name normalization
- Cap `days` parameters: `Math.min(parseInt(params.days || '30', 10), 365)`
- Return `{ count, items }` shaped responses from list endpoints
- Add `noClient: true` to routes that don't need the Shopify API client

## Product Hierarchy

```
Master Product (MP) → Style (by color/fabric) → Fit → Size → Length
```

- **Suits:** fits = Lorenzo 6, Lorenzo 4, Alexander 4, Alexander 2
- **Shirts:** fits = Modern (Extra Slim), Contemporary (Slim), Classic
- **Pants:** fits = Slim, Regular, Relaxed

Title matchers in `lib/products.js` map Shopify product titles to MP seed IDs.
HC360 vs HC480 split at $400 max variant price.
"do not use" products are always excluded.

## PO Stage Pipeline

```
Concept → Design(PD✓) → Sample → Approved(PD✓) → Costed(FIN✓) →
Ordered → Production → QC(PD✓) → Shipped → In Transit →
Received(FIN✓) → Distribution
```

Stages marked PD require `checkedBy` (product development sign-off).
Stages marked FIN require `checkedBy` (finance sign-off).
Data gates enforce: vendor before Design, FOB+units before Costed, ETD before Shipped, etc.

## How a Request Flows

```
Browser → Netlify CDN → netlify.toml redirect → Netlify Function
  → createHandler() → authenticate() → route match
  → handler(client, ctx) → ShopifyClient._request()
  → Shopify REST API → response mapped by lib/mappers.js
  → cached by lib/cache.js → JSON response with ETag
```

## Cache Architecture

Each function gets its own esbuild-bundled cache copy. You CANNOT clear another function's cache. TTLs are the real invalidation:

| Key | TTL |
|-----|-----|
| products | 5 min |
| orders | 1 min |
| inventory | 2 min |
| pos | 1 min |
| velocity | 3 min |
| status | 30 sec |

## Persistence

| Data | Storage |
|------|---------|
| Products, orders, inventory | Shopify (source of truth) + in-memory cache |
| Purchase orders | Netlify Blobs (`store.po`) |
| Shipments | Netlify Blobs (`store.shipments`) |
| Inventory snapshots | Netlify Blobs (`store.snapshots`) |

## Env Vars (Netlify)

| Variable | Required |
|----------|----------|
| `SHOPIFY_STORE_URL` | Yes — `aticaman.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Yes — `shpat_...` |
| `SKIP_AUTH` | Yes — `true` |
| `STOCKY_API_KEY` | Optional |

## Stores

Lakewood, Flatbush, Crown Heights, Monsey, Online, Reserve.
All location normalization goes through `lib/locations.js`.

## Key Endpoints

### Products (the root)
- `GET /api/products/masters` — MPs enriched with live Shopify styles, inventory, images
- `GET /api/products/seeds` — raw MP catalog, PLM stages (no Shopify needed)
- `GET /api/products/trees` — product tree with Style→Fit→Size hierarchy

### Orders / Analytics
- `GET /api/orders/mp-velocity?days=30` — velocity by Master Product (production planning)
- `GET /api/orders/sales?days=30` — revenue summary with daily breakdown
- `GET /api/orders/velocity?days=30` — velocity by individual SKU

### Purchase Orders
- `POST /api/purchase-orders` with `{ mpId: 'londoner' }` — auto-fills from seed
- `PATCH /api/purchase-orders/:id/stage` with `{ stage: 'Approved', checkedBy: 'John' }`
- `GET /api/purchase-orders/stages` — stage definitions with gate types

## What Needs Work

### High Priority
- [ ] v2 event bus end-to-end testing — modules subscribe but cross-module communication not tested
- [ ] v2 marketplace product detail view — click an MP → see styles, fits, sizes, inventory, PLM stage
- [ ] Cash-flow PO creation form — modal to create POs from MP list
- [ ] Production planning view — combine MP velocity + current inventory to suggest reorder quantities

### Medium Priority
- [ ] Inventory by MP — aggregate inventory across locations per Master Product (not per SKU)
- [ ] Stock module rewrite — show inventory grouped by MP, not raw Shopify inventory items
- [ ] PO auto-shipment creation — when PO hits "Shipped" stage, auto-create shipment record
- [ ] Sales pulse backoff — if sync fails, double interval up to 15 min, reset on success

### Lower Priority
- [ ] Monolith API migration — atica_app.html still has its own inline sync logic
- [ ] Branch protection — CONTRIBUTING.md exists but GitHub rules not enforced
- [ ] Test suite — endpoint smoke tests exist (scripts/test-endpoints.js) but can't run from CI (DNS blocked)

## Testing

```bash
# Syntax check
node --check lib/products.js
node --check netlify/functions/orders.js

# Full dependency chain
node -e "
const m = require('./lib/mappers');
const a = require('./lib/analytics');
const p = require('./lib/products');
const l = require('./lib/locations');
console.log('All resolve');
console.log('MPs:', p.MP_SEEDS.length);
console.log('Match test:', p.matchProduct('Londoner White Shirt'));
"

# Endpoint tests (requires network access to atica-ops.netlify.app)
npm run test:endpoints
```

## How to Add a New MP

1. Add seed to `MP_SEEDS` array in `lib/products.js`
2. Add title matcher to `TITLE_MATCHERS` in same file
3. If the matcher key differs from the seed ID, add an alias to `ALIASES`
4. Test: `node -e "const p = require('./lib/products'); console.log(p.matchProduct('Your Shopify Title'))"`
5. The new MP will automatically appear in `/api/products/masters` on next sync

## How to Add a New Netlify Function

```javascript
const { createHandler, RouteError } = require('../../lib/handler');
const cache = require('../../lib/cache');

async function myHandler(client, { params, body, pathParams }) {
  // client = ShopifyClient (null if noClient: true)
  // params = query string parameters
  // body = parsed JSON body (POST/PATCH)
  // pathParams = { id: '123' } from path ':id'
  return { data: 'response' };
}

const ROUTES = [
  { method: 'GET', path: '', handler: myHandler },
];

exports.handler = createHandler(ROUTES, 'my-endpoint');
```

Then add to `netlify.toml`:
```toml
[[redirects]]
  from   = "/api/my-endpoint/*"
  to     = "/.netlify/functions/my-endpoint/:splat"
  status = 200
```
