# Atica Man — Operations Platform

Live: https://atica-ops.netlify.app  
Store: aticaman.myshopify.com

## Team Zones

| Session  | Zone                        | Scope                                          |
|----------|-----------------------------|-------------------------------------------------|
| **Shrek**    | `app/marketplace/`          | MPs, product matching, title matchers, nav      |
| **Deshawn**  | `app/cash-flow/`            | Cash flow, POs, AP/AR, bookkeeping              |
| **Stallon**  | `lib/shopify/` + `app/api/` | Shopify client, sync, webhooks, API routes      |

**Rule: stay in your lane. Don't edit other zones.**

## Architecture

```
lib/shopify/
  client.ts      ← Shopify API client (paginated, rate-limited)
  types.ts       ← Full TypeScript types (raw Shopify + Atica domain)
  mappers.ts     ← Shopify → Atica transforms + product tree builder
  analytics.ts   ← Velocity, sales aggregation
  locations.ts   ← Store name normalizer (Shopify → Lakewood/Flatbush/etc)
  sync.ts        ← fullSync() + salesPulse() + getProductInventory()
  index.ts       ← Barrel export

app/api/
  shopify/[...path]/route.ts  ← All /api/shopify/* endpoints (backward compat)
  sync/full/route.ts          ← POST /api/sync/full (boot sync)
  sync/pulse/route.ts         ← POST /api/sync/pulse (3-min lightweight)
  inventory/[productId]/       ← GET /api/inventory/:id (per-product by store)
  webhooks/shopify/route.ts   ← POST /api/webhooks/shopify (Shopify events)
```

## API Endpoints

### Shopify (backward compatible with Netlify functions)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/shopify/status` | Connection check |
| POST | `/api/shopify/sync/products` | All products → mapped |
| POST | `/api/shopify/sync/orders` | Orders (body: `{since}`) |
| POST | `/api/shopify/sync/inventory` | All locations + levels |
| GET | `/api/shopify/velocity?days=30` | SKU velocity |
| GET | `/api/shopify/sales?days=30` | Sales summary + daily |
| GET | `/api/shopify/ledger?days=30` | Ledger entries |
| GET | `/api/shopify/sku-map` | All SKU mappings |
| GET | `/api/shopify/titles` | Product title list |
| GET | `/api/shopify/products/tree` | Product trees (MP→Style→Fit→Size) |
| POST | `/api/shopify/snapshot` | Inventory snapshot |
| POST | `/api/shopify/webhooks/setup` | Register webhooks |

### New (Stallon)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/full` | Full sync (products+inventory+orders+velocity) |
| POST | `/api/sync/pulse` | Sales-only pulse (last 24h, runs every 3min) |
| GET | `/api/inventory/:productId` | Per-product inventory by store |
| POST | `/api/webhooks/shopify` | Webhook receiver |

## Product Hierarchy

```
Master Product (MP)
  └── Style (color/fabric)
        └── Fit
              └── Size
                    └── Length (where applicable)
```

### Fits by Category

- **Suits**: Lorenzo 6, Lorenzo 4, Alexander 4, Alexander 2
- **Shirts**: Modern (Extra Slim), Contemporary (Slim), Classic
- **Pants**: Slim, Regular, Relaxed

### Stores

Lakewood, Flatbush, Crown Heights, Monsey, Online, Reserve, Wholesale

## Setup

```bash
git clone https://github.com/reuven-kaminetzky/atica-ops.git
cd atica-ops
npm install
cp .env.example .env.local
# Fill in SHOPIFY_ACCESS_TOKEN
npm run dev
```

## Test

```bash
npx tsx scripts/test-shopify.ts
```
