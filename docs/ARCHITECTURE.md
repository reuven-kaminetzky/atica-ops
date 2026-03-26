# Atica Ops — Architecture

> Single source of truth for how the system works.
> Read this before writing any code.

## System Overview

```
Browser → Netlify CDN → netlify.toml redirect → Netlify Function
  → createHandler() → authenticate() → route match
  → handler(client, ctx) → ShopifyClient._request()
  → Shopify REST API → response mapped → cached → JSON + ETag
```

Two frontends, one backend:
- **Monolith** `/atica_app.html` — 1MB single-file, production
- **Modular v2** `/v2` → `atica_v2.html` — ES modules, long-term replacement

## File Ownership

| Directory | Purpose | Who touches it |
|-----------|---------|----------------|
| `lib/` | Shared libraries — every function imports from here | Architecture owner |
| `lib/shopify.js` | Shopify API client (request, retry, pagination) | Architecture owner |
| `lib/shopify/*.ts` | Type reference docs (NOT compiled, NOT used at runtime) | Reference only |
| `lib/shopify/*.js` | Compiled JS from TS (mappers, analytics) | Architecture owner |
| `lib/locations.js` | Store name normalization — **single source of truth** | Architecture owner |
| `lib/products.js` | MP seeds, title matchers, PLM stages — **product tree root** | Architecture owner |
| `lib/handler.js` | DRY handler factory for all Netlify functions | Architecture owner |
| `lib/cache.js` | In-memory TTL cache (per-function, not shared) | Architecture owner |
| `lib/store.js` | Netlify Blobs persistence (POs, shipments, snapshots) | Architecture owner |
| `lib/auth.js` | CORS, JSON response, authentication | Architecture owner |
| `netlify/functions/` | API endpoints — one file per domain | Per-domain owner |
| `modules/` | v2 frontend ES modules | Per-module owner |
| `atica_app.html` | Monolith — do not edit without `node --check` | Careful |
| `atica_v2.html` | v2 shell | Architecture owner |

## Patterns

### 1. Every function uses `createHandler`

```js
const { createHandler, RouteError } = require('../../lib/handler');
const ROUTES = [
  { method: 'GET', path: '', handler: listThings },
  { method: 'GET', path: ':id', handler: getThing },
];
exports.handler = createHandler(ROUTES, 'things');
```

Never write raw `exports.handler = async (event) => {}`. The handler gives you:
- CORS headers
- Authentication
- Path parameter extraction
- Body parsing with error handling
- ETag generation
- RouteError → proper HTTP status codes
- Catch-all 500 with logging

### 2. Use RouteError for expected errors

```js
if (!id) throw new RouteError(400, 'ID required');
const item = await store.get(id);
if (!item) throw new RouteError(404, 'Not found');
```

Never `throw new Error()` in a handler — it becomes a 500. Use RouteError for 400/404/409.

### 3. Location normalization goes through `lib/locations.js`

```js
const { normalize, resolveOrderStore, buildLocationMap } = require('../../lib/locations');
```

Never inline store name matching. The canonical store list is:
**Lakewood, Flatbush, Crown Heights, Monsey, Online, Reserve**

### 4. Cache with TTL constants

```js
const cache = require('../../lib/cache');
cache.set(key, data, cache.CACHE_TTL.products); // 5 min
```

Each function gets its own cache copy (esbuild bundles separately).
You cannot clear another function's cache. TTLs are the real invalidation.

| Key | TTL | Why |
|-----|-----|-----|
| products | 5 min | Products rarely change |
| orders | 1 min | Orders flow in continuously |
| inventory | 2 min | Inventory changes with sales |
| pos | 1 min | POS needs near-real-time |
| velocity | 3 min | Aggregated, stable |
| sales | 2 min | Sales summary |
| status | 30 sec | Connection check |

### 5. Persistent data uses `lib/store.js` (Netlify Blobs)

```js
const store = require('../../lib/store');
await store.po.put('PO-001', data);
const po = await store.po.get('PO-001');
const all = await store.po.getAll();
```

Named stores: `po`, `shipments`, `snapshots`, `settings`.
Never use in-memory variables (`let _data = []`) for data that needs to survive cold starts.

### 6. Shopify API calls go through `lib/shopify.js`

```js
const { createClient } = require('../../lib/shopify');
const client = await createClient();
const { products } = await client.getProducts();
const { orders } = await client.getOrders({ created_at_min: since });
```

The client handles: 8s request timeout, 25s pagination timeout, 3x retry with backoff,
429 rate limit retry (capped at 3), cached `createClient` (5 min).

**API version: `2025-10`** — do NOT change without testing:
```bash
curl https://atica-brand.myshopify.com/admin/api/YYYY-MM/shop.json \
  -H "X-Shopify-Access-Token: $TOKEN"
```

### 7. Frontend modules follow init/destroy lifecycle

```js
export async function init(container) {
  // Render UI, fetch data, bind events
}
export function destroy() {
  // Clean up state, subscriptions
}
```

Modules communicate through the event bus only — never import another module directly.

### 8. Bound your queries

Always cap `days` parameters and default list queries:

```js
const days = Math.min(parseInt(params.days || '30', 10), 365);
const since = params.since || sinceDate(90); // never fetch all history
const limit = Math.min(parseInt(params.limit || '50', 10), 200);
```

## Priority Stack

The system is a tree:

1. **MPs (roots)** — Master Products with correct Shopify styles. The PLM backbone.
2. **POs (trunk)** — Purchase Orders with stage gates, PD and finance check-ins
3. **Cash flow (trunk)** — Tied to POs (costs) and Shopify orders (revenue)
4. **Production planning (branches)** — What to order, when, based on MP velocity
5. **Analytics (branches)** — From real order data, aggregated by MP

POS is not a priority — just a data feed into cash flow.

## Data Flow

### Product hierarchy (Shopify → Atica)

```
Shopify Product → buildProductTree() → ProductTree
  └── styles[] (by Color/Style option)
       └── fits[] (by Fit option — Lorenzo 6, Slim, etc.)
            └── variants[] (individual SKUs with size + inventory)
```

### MP matching (Shopify → Master Products)

```
lib/products.js matchAll(shopifyProducts)
  → for each Shopify product:
    → run title through TITLE_MATCHERS (regex + price for HC split)
    → resolve aliases (bengal-stripe → bengal)
    → group by MP seed ID
  → returns { matched: { seedId: [products] }, unmatched }
```

### PO lifecycle with check-ins

```
Concept → Design(PD✓) → Sample → Approved(PD✓) → Costed(FIN✓) →
Ordered → Production → QC(PD✓) → Shipped → In Transit →
Received(FIN✓) → Distribution
```

POs linked to MPs via `mpId`. Creating a PO with `mpId:'londoner'`
auto-populates vendor, FOB, lead time, MOQ, HTS, duty from seed.

### Order → Store resolution

```
order.location_id → Shopify locations → lib/locations.js normalize()
  fallback: order.fulfillments[0].location_id
  fallback: order.source_name → 'Online' / 'In-Store'
```

### Data persistence

| Data | Storage | Survives cold start? |
|------|---------|---------------------|
| Products, orders, inventory | Shopify (source of truth) + in-memory cache | Cache: no. Shopify: yes. |
| Purchase orders | Netlify Blobs (`store.po`) | Yes |
| Shipments | Netlify Blobs (`store.shipments`) | Yes |
| Inventory snapshots | Netlify Blobs (`store.snapshots`) | Yes |
| User preferences | Netlify Blobs (`store.settings`) | Yes |

## Configuration

All config lives in Netlify environment variables. Never hardcode.

| Variable | Required | Value |
|----------|----------|-------|
| `SHOPIFY_STORE_URL` | Yes | `atica-brand.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Yes | `shpat_...` |
| `SKIP_AUTH` | Yes (for now) | `true` |
| `SHOPIFY_CLIENT_ID` | Optional | For OAuth flow |
| `SHOPIFY_CLIENT_SECRET` | Optional | For OAuth flow |
| `SHOPIFY_WEBHOOK_SECRET` | Optional | HMAC verification |

## Anti-Patterns — Do Not

- **Don't hardcode store URLs** in code. Use `SHOPIFY_STORE_URL` env var.
- **Don't bump `SHOPIFY_API_VERSION`** without `curl` testing first.
- **Don't use `let _data = []`** for persistent storage. Use `lib/store.js`.
- **Don't inline store name matching.** Use `lib/locations.js`.
- **Don't fetch all orders without a date filter.** Always pass `since` or `created_at_min`.
- **Don't throw `new Error()` in handlers.** Use `RouteError` for expected failures.
- **Don't edit `atica_app.html` without running `node --check`.**
- **Don't import between frontend modules.** Use the event bus.
- **Don't require TS files directly.** Use the JS counterparts or the proxy modules.

## Route Map

| Method | Path | Function | Auth | Shopify? |
|--------|------|----------|------|----------|
| GET | /api/status | status.js | yes | yes |
| GET | /api/products | products.js | yes | yes |
| POST | /api/products/sync | products.js | yes | yes |
| GET | /api/products/titles | products.js | yes | yes |
| GET | /api/products/trees | products.js | yes | yes |
| GET | /api/products/masters | products.js | yes | yes |
| GET | /api/products/seeds | products.js | yes | no |
| GET | /api/products/sku-map | products.js | yes | yes |
| GET | /api/orders | orders.js | yes | yes |
| POST | /api/orders/sync | orders.js | yes | yes |
| GET | /api/orders/velocity | orders.js | yes | yes |
| GET | /api/orders/sales | orders.js | yes | yes |
| GET | /api/orders/mp-velocity | orders.js | yes | yes |
| GET | /api/orders/drafts | orders.js | yes | yes |
| GET | /api/inventory | inventory.js | yes | yes |
| POST | /api/inventory/sync | inventory.js | yes | yes |
| POST | /api/inventory/adjust | inventory.js | yes | yes |
| POST | /api/inventory/transfer | inventory.js | yes | yes |
| GET | /api/pos/today | pos.js | yes | yes |
| GET | /api/pos/by-location | pos.js | yes | yes |
| GET | /api/pos/feed | pos.js | yes | yes |
| GET | /api/ledger | ledger.js | yes | yes |
| POST | /api/ledger/snapshot | ledger.js | yes | yes |
| GET | /api/ledger/snapshots | ledger.js | yes | no |
| GET | /api/customers | customers.js | yes | yes |
| GET | /api/customers/:id | customers.js | yes | yes |
| GET | /api/customers/top | customers.js | yes | yes |
| GET | /api/customers/segments | customers.js | yes | yes |
| GET | /api/purchase-orders | purchase-orders.js | yes | no |
| GET | /api/purchase-orders/stages | purchase-orders.js | yes | no |
| GET | /api/purchase-orders/:id | purchase-orders.js | yes | no |
| POST | /api/purchase-orders | purchase-orders.js | yes | no |
| PATCH | /api/purchase-orders/:id | purchase-orders.js | yes | no |
| DELETE | /api/purchase-orders/:id | purchase-orders.js | yes | no |
| PATCH | /api/purchase-orders/:id/stage | purchase-orders.js | yes | no |
| GET | /api/shipments | shipments.js | yes | no |
| POST | /api/shipments | shipments.js | yes | no |
| PATCH | /api/shipments/:id | shipments.js | yes | no |
| POST | /api/shipments/:id/arrive | shipments.js | yes | yes |
| POST | /api/webhooks/shopify | webhooks-shopify.js | HMAC | no |
