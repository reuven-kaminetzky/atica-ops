# Atica Man — Operations Platform

**Live:** https://atica-ops.netlify.app/atica_app.html  
**Store:** aticaman.myshopify.com

## Architecture

```
atica_app.html          ← Entire frontend (single-file SPA, ~1MB)
netlify/functions/
  shopify.js            ← Shopify API proxy (cached, rate-limited)
  webhooks-shopify.js   ← Webhook receiver
lib/
  shopify.js            ← Shopify client (paginated, auto-retry on 429)
  mappers.js            ← Shopify → Atica data transforms
  analytics.js          ← Velocity, sales aggregation
  auth.js               ← CORS, API key auth, same-origin check
lib/shopify/            ← TypeScript reference types (not compiled)
```

**No build step.** No framework. HTML served static, functions run serverless.

## Team Zones

| Session    | Files                    | Scope                       |
|------------|--------------------------|------------------------------|
| **Stallon**  | `lib/`, `netlify/functions/`, API routes | Shopify client, sync, cache |
| **Shrek**    | Product matching, title matchers in `atica_app.html` | MPs, nav, product UI |
| **Deshawn**  | Finance renderers in `atica_app.html` | Cash flow, POs, AP/AR |

## API Endpoints

All via `/api/shopify/` → Netlify function. Cached in-memory (survives within lambda container).

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `status` | 30s | Connection check |
| POST | `sync/products` | 5min | All products mapped |
| POST | `sync/orders` | 1min | Orders (body: `{since}`) |
| POST | `sync/inventory` | 2min | Locations + levels |
| GET | `velocity?days=30` | 3min | SKU velocity |
| GET | `sales?days=30` | 2min | Sales summary + daily |
| GET | `ledger?days=30` | — | Ledger entries |
| GET | `sku-map` | 5min | SKU mappings |
| GET | `titles` | 5min | Product title list |
| GET | `cache/stats` | — | View cache state |
| POST | `cache/clear` | — | Flush cache |

GET responses include `ETag` — browser gets 304 Not Modified on repeat requests.

## Auto-Sync

- **Boot:** Full sync (products + inventory + orders + velocity) on page load
- **Pulse:** Lightweight sales-only sync every 3 minutes (last 24h orders)
- **Live indicator:** Green dot in topbar shows sync status + time since last pulse

## Setup

```bash
git clone https://github.com/reuven-kaminetzky/atica-ops.git
cd atica-ops
npm install
cp .env.example .env.local
# Fill in SHOPIFY_ACCESS_TOKEN
npx netlify dev
```
