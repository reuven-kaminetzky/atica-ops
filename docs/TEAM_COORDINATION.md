# Atica Man — Team Coordination & Session Ownership

**March 2026 — Data Version v32**

## Project Overview

| | |
|---|---|
| **Live URL** | https://atica-ops.netlify.app/atica_app.html |
| **Repository** | github.com/reuven-kaminetzky/atica-ops |
| **Shopify Store** | aticaman.myshopify.com |
| **Architecture** | Static HTML + Netlify Functions — no build step |
| **Stores** | Lakewood, Flatbush, Crown Heights, Monsey, Online, Reserve |

## Team Sessions & Ownership

| Session | Branch | Files | Scope |
|---------|--------|-------|-------|
| **Stallon** | `feat/stallon-api` | `netlify/functions/`, `lib/` | Shopify API, sync, caching, webhooks, all backend |
| **Shrek** | `feat/shrek-mps` | `atica_app.html` (Products) | Master Products, title matchers, product detail, nav |
| **Deshawn** | `feat/deshawn-cashflow` | `atica_app.html` (Finance) | Cash flow, PO stages, stage gates, AP/AR, bookkeeping |
| **Nikita** | `feat/nikita-modules` | `modules/`, `atica_v2.html` | Modular architecture, event bus, v2 shell, components |
| **Trump** | — | — | Oversight — ensures maximum team utilization |

## Rules of Engagement

### Branching
- **main** — Production. Protected. Never push directly.
- **dev** — Integration. All PRs merge here first, then to main.
- **feat/*** — Each session works on their feature branch only.

### Push Workflow
1. Work on your feature branch only
2. Run `node --check` on extracted JS before every push
3. PR your branch → `dev`
4. Once dev is tested, PR `dev` → `main`
5. Never edit files outside your zone
6. Always pull the latest before starting work

### Hard Boundaries
- **Deshawn's `_checkStageGate` and `_gate` logic**: DO NOT TOUCH from other sessions. `_checkStageGate` is a **GLOBAL function** — call it as `_checkStageGate()`, NOT `Store._checkStageGate()`.
- **Shrek's title matchers (`_TITLE_MATCHERS`)**: DO NOT TOUCH from other sessions.
- **Stallon's `lib/*.js` and `netlify/functions/`**: DO NOT TOUCH from other sessions.
- **Nikita's `modules/` and `atica_v2.html`**: DO NOT TOUCH from other sessions.

## API Endpoints

All endpoints run as Netlify Functions. Legacy routes (`/api/shopify/*`) and modular routes (`/api/products/*`, `/api/orders/*`, etc.) run in parallel.

### Legacy (shopify.js god-function)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/shopify/status` | Connection check (cached 30s) |
| POST | `/api/shopify/sync/products` | All products mapped (cached 5min) |
| POST | `/api/shopify/sync/orders` | Orders — body: `{since}` (cached 1min) |
| POST | `/api/shopify/sync/inventory` | All locations + levels (cached 2min) |
| GET | `/api/shopify/velocity?days=30` | SKU velocity |
| GET | `/api/shopify/sales?days=30` | Sales summary + daily breakdown |
| GET | `/api/shopify/draft-orders` | Stocky draft orders |
| GET | `/api/shopify/ledger?days=30` | Ledger entries |
| GET | `/api/shopify/titles` | Product title list |
| GET | `/api/shopify/sku-map` | SKU mapping table |

### Modular (split functions)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List all products (cached 5min) |
| POST | `/api/products/sync` | Force sync from Shopify |
| GET | `/api/products/titles` | Lightweight title list |
| GET | `/api/orders` | List orders (?since= filter) |
| POST | `/api/orders/sync` | Sync orders from Shopify |
| GET | `/api/orders/velocity?days=30` | SKU velocity |
| GET | `/api/orders/sales?days=30` | Sales summary + daily |
| GET | `/api/orders/drafts` | Stocky draft orders |
| GET | `/api/inventory` | All locations + levels |
| **GET** | **`/api/pos/today`** | **Today's sales across all stores (cached 1min)** |
| **GET** | **`/api/pos/by-location?days=7`** | **Sales grouped by store with AOV** |
| **GET** | **`/api/pos/feed?limit=50`** | **Recent transactions with customer names** |
| GET | `/api/ledger?days=30` | Ledger entries for finance |
| GET | `/api/status` | Connection + cache stats |
| POST | `/api/status/cache/clear` | Flush in-memory cache |
| POST | `/api/status/webhooks` | Register Shopify webhooks |

> **Deshawn**: The POS endpoints (`/api/pos/today`, `/api/pos/by-location`, `/api/pos/feed`) return data grouped by store with automatic location normalization. Use these for the cash-flow module instead of raw order queries.

## Product Hierarchy

**Master Product (MP) → Style → Fit → Size → Length**

| Category | Fits |
|----------|------|
| **Suits** | Lorenzo 6, Lorenzo 4, Alexander 4, Alexander 2 |
| **Shirts** | Modern (Extra Slim), Contemporary (Slim), Classic |
| **Pants** | Slim, Regular, Relaxed (2–3 fits) |

## Current Status

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| Shopify connection + sync | ✅ LIVE | Stallon | Full boot sync + 3-min pulse |
| Product matching | ✅ LIVE | Shrek | ~35 MPs matched to Shopify |
| Stage gates (all 6) | ✅ LIVE | Deshawn | _checkStageGate enforced |
| Cash flow (real data) | ✅ LIVE | Deshawn | PO payments + Shopify inflow |
| Sales drilldown (7 levels) | ✅ LIVE | Stallon | Total→Cat→MP→Style→Fit→Size→Orders |
| Product Stack PLM | ✅ LIVE | Shrek | Overview, Collection, Tech Pack, Commerce |
| Modular backend (6 functions) | ✅ LIVE | Nikita | products, orders, inventory, pos, ledger, status |
| Frontend modules (v2) | 🟡 WIP | Nikita | Skeletons in modules/ — not wired to UI yet |
| In-memory API cache | ✅ LIVE | Stallon | Products 5min, orders 1min, inventory 2min |
| Webhook receiver | ✅ LIVE | Stallon | orders/create, products/update, inventory/update |
| Branch protection | 🔴 TODO | — | CONTRIBUTING.md written, not enforced in GitHub |

## Next Tasks

### Stallon (API)
- Auto-push container/vessel to shipment when PO hits stage 6
- Wire inventory/adjust endpoint to transfer completion
- Migrate frontend API calls from `/api/shopify/*` to modular endpoints

### Deshawn (Cash Flow)
- Wire `D.outTotals` to pull from `REAL_AP_INVOICES` dynamically
- PO payment status: `projected` → `upcoming` when ETD confirmed
- Cash flow month cell click → opens breakdown
- Use `/api/pos/today`, `/api/pos/by-location`, `/api/pos/feed` for store data

### Shrek (Products)
- MP cards: use `Store.getInventoryFor(p.id)` for real stock
- Style-level stock from real Shopify variant inventory
- CRM customer profiles with Shopify order history

### Nikita (Modular)
- Build on existing `modules/` — do not rebuild
- Test v2 modules against `atica_v2.html`
- Wire event bus to module communication

## Incident: March 25 Collision

Multiple sessions pushed to main simultaneously, causing cascading failures:

- Stallon and Deshawn both edited `atica_app.html` on main at the same time
- Stallon's cleanup reverted the Netlify function, removing endpoints Deshawn's code needed
- A regex pass created a double-nested `getRealVelocity` — app stuck on loading
- `netlify.toml` changes (esbuild, Role conditions) broke deployment
- Resolution: force-reset to last working commit, then fixed 4 JS syntax errors

**Takeaway: this is why feature branches exist. Never push directly to main. Always check what others have pushed before reverting shared files.**
