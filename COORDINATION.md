# Atica Man OPS — Team Coordination

**THIS IS THE ONLY FILE YOU NEED TO READ. Everything is here.**

**THERE IS NO LEGACY APP. No modules/*.js. No atica_app.html. Only Next.js in app/.**

---

## 1. SETUP (run this first)

```bash
git clone https://github.com/reuven-kaminetzky/atica-ops.git
cd atica-ops
npm install
node test.js          # expect 96+ passed, 0 failed
npx next build        # expect 'Compiled successfully'
cat COORDINATION.md   # find your name, read your tasks
```

If git asks for auth, use PAT: `<ask Reuven for PAT>`

**Before every push:**
```bash
git pull origin main
node test.js
npx next build
git add -A && git diff --cached --stat
git commit -m "one purpose per commit"
git push origin main
```
If push rejected: `git pull origin main --rebase && git push origin main`

---

## 2. WHAT THIS IS

Custom ERP for Atica Man menswear retail.
- 4 stores (Lakewood, Flatbush, Crown Heights, Monsey) + Online + Reserve
- $7.5M/yr revenue, growing 50% YoY
- 41 Master Products, 1,108 Shopify products, 597 matched
- Next.js 16 + Neon Postgres + Netlify

| Key | Value |
|-----|-------|
| Live URL | https://atica-ops-v3.netlify.app |
| Site Password | atica2026ops |
| Netlify Site ID | 053ab1d3-c859-49b2-92ba-d115139e8b4c |
| Netlify Team ID | 69c1d34eb58903aaa4115dc9 |
| Shopify Store | atica-brand.myshopify.com (Plus) |
| Shopify Token | env var SHOPIFY_TOKEN (ask Reuven) |
| API Version | 2025-04 — NEVER change without testing |
| DB | Neon Postgres via @netlify/neon (auto-provisioned) |
| Repo | github.com/reuven-kaminetzky/atica-ops |
| Branch | main (push directly, no PRs) |

---

## 3. TEAM

| Session | Tool | Role |
|---------|------|------|
| **Peter** | Opus, Claude.ai | Architecture. No code. Design docs + reviews. |
| **Bonney** | Sonnet, Claude Code | Data pipeline: sync, Shopify, matchers, webhooks. |
| **Danny** | Sonnet, Claude Code | Frontend: all pages, components, server actions. |
| **Almond** | Sonnet, Claude Code | Backend: DAL, schema, auth, CI, logging. |

---

## 4. ARCHITECTURE

### Data Flow
```
Shopify (source of truth)
    → Sync background function (15 min timeout)
        → Postgres (business data)
    → Webhooks (real-time updates)
    → Daily scheduled sync (5 AM UTC)

Pages read via:
    Server actions (actions.js)
        → Domain modules (lib/product/, lib/supply-chain/)
            → DAL (lib/dal/)
                → Postgres
```

### Storage
- **Postgres** (@netlify/neon): All business data + sync status. Works everywhere.
- **Netlify Blobs** (@netlify/blobs): ONLY works in `netlify/functions/*.js`. NOT in Next.js. Optional caching only.

### Routing — CRITICAL
`netlify.toml` has redirects that intercept `/api/*` BEFORE Next.js:

**Goes to Netlify Functions (via redirect):**
`/api/sync/*`, `/api/products/*`, `/api/orders/*`, `/api/pos/*`,
`/api/purchase-orders/*`, `/api/inventory/*`, `/api/finance/*`,
`/api/status/*`, `/api/customers/*`, `/api/shipments/*`,
`/api/workflow/*`, `/api/ledger/*`, `/api/webhooks/shopify`

**Goes to Next.js (no redirect):**
`/api/verify`, `/api/migrate`, `/api/seed`, `/api/health`,
`/api/store`, `/api/van-routes`, `/api/transfers`

**If you create a Next.js route under a redirected path, IT WILL NEVER RUN.**

---

## 5. FILE OWNERSHIP

### Bonney — Data Pipeline
```
OWNS:     netlify/functions/sync-background.js  (15 min background sync)
          netlify/functions/sync.js  (trigger/status/unmatched API)
          netlify/functions/daily-sync.mjs  (scheduled trigger)
          app/api/sync/route.js  (legacy step-based, to be removed)
          app/api/webhooks/*  (shopify receiver, register)
          lib/shopify.js
          lib/products.js  (MP seeds, title matchers, demand logic)
DO NOT TOUCH: app/(dashboard)/ pages, lib/dal/, supabase/migrations/
```

**Bonney's tasks (sprint-aligned):**
1. ~~Verify sync end-to-end~~ DONE
2. ~~Variant options extraction~~ DONE
3. ~~Sync/webhook race guard~~ DONE
4. **SPRINT 0: Webhook dedup** — Add X-Shopify-Event-Id logging to webhook_events table. Skip duplicate webhooks. See docs/SPRINT_PLAN.html.
5. Register webhooks (orders/create, inventory/update, products/update)
6. **SPRINT 1: Populate SKUs from Shopify variants** — During sync, loop through each product's variants. Parse option values (Fit/Size/Length). Upsert into skus table. Map option-to-dimension per product type (suits have 3 options, shirts have 2, ties have 1).
7. **SPRINT 1: Link sales to SKUs** — Resolve variant_id on each line item to the matching SKU. Backfill old sales.
8. **SPRINT 2: Seed inventory from Shopify levels API** — One-time seed into inventory_events. Then daily reconciliation.
9. **SPRINT 2: Wire webhook inventory handler to event model** — inventory_levels/update → resolve SKU + location → INSERT inventory_event.
10. Expand matcher coverage past 597/1108
11. ~~Delete 11 legacy functions~~ DONE
12. ~~Delete old sync route~~ DONE

### Danny — Frontend
```
OWNS:     app/(dashboard)/*.js  (all pages)
          app/(dashboard)/actions.js  (server actions)
          app/(dashboard)/layout.js
          components/*.js
DO NOT TOUCH: lib/products.js, netlify/functions/, lib/dal/, supabase/
```

**UX PHILOSOPHY (from Reuven — MANDATORY):**
- NO KPI cards. NO sparklines. NO charts on the home page. NO dashboards.
- Drill-down tree navigation. Click to go deeper. Surface is minimal.
- Think Odoo: landing page = clean entry points. Data appears when you navigate TO it.
- Pattern: List (table) → click row → Detail → click section → Sub-detail.
- Functional tool, not a pretty dashboard.
- ANALYTICS = the power tool. Flexible Group By + THEN BY tree. See docs/ANALYTICS_DESIGN.md.

**Danny's tasks:**
1. Rebuild landing page: REMOVE KPI cards. Clean nav entry points + alerts only.
2. Products: clean table (name, category, stock, velocity). Click row → detail.
3. Product detail: header, collapsible sections (Styles, POs, Stack).
4. PO list: table. Click row → PO detail with stage track + payments.
5. Settings: verify sync polling UI works.
6. Cash flow: table of weekly outflow from real data.
7. **ANALYTICS PAGE:** Read docs/ANALYTICS_DESIGN.md. Group By pills, THEN BY chain, tree table, column picker, filters. Server action: `getDataBreakdown({ groupBy: 'category' })`.
8. Mobile: test all pages, fix layouts.

**NEXT PHASE — Danny (sprint-aligned):**
9. ~~PO WORKFLOW~~ DONE
10. **STACK BUILDER:** Read docs/PRODUCT_STACK_BUILDER.md. Section tabs, completeness, required fields.
11. ~~UNIFIED DATA EXPLORER~~ DONE
12. ~~CASH FLOW~~ DONE (inflow + outflow + running position)
13. **SPRINT 5: Store stock lookup screen** — The most-used screen in retail ERP. Select product → see full size/color/fit matrix with on_hand per location. Needs SKUs + inventory_levels materialized view.
14. **SPRINT 5: Transfer flow UI** — Create transfer, confirm receipt. Two inventory events per transfer.
15. **SPRINT 5: PO receiving UI** — On PO stage 11, enter actual counts per line item. Variance tracking.
16. **SPRINT 6: Role-based page rendering** — Disable controls based on user role (after Clerk auth).

**Danny calls data through:**
`actions.js` → domain modules → DAL → Postgres. **Danny NEVER writes SQL.**
If data is missing, ask Almond to add a DAL method + server action.

### Almond — Backend & Infrastructure
```
OWNS:     lib/dal/*.js  (ALL DAL files including analytics.js)
          supabase/migrations/*.sql
          app/api/verify/route.js, app/api/migrate/route.js, app/api/seed/route.js
          lib/logger.js, lib/auth.js, lib/validate.js
          lib/constants.js, lib/domain.js
          lib/events.js, lib/event-handlers.js
          Domain modules: lib/product/, lib/supply-chain/, lib/finance/,
            lib/inventory/, lib/sales/, lib/logistics/, lib/marketing/
DO NOT TOUCH: app/(dashboard)/ pages, lib/products.js, lib/shopify.js,
              netlify/functions/sync-background.js
```

**Almond's tasks (sprint-aligned):**
1. ~~Migration 007 (drops premature tables)~~ DONE
2. ~~Auth tokens~~ DONE
3. ~~Protect destructive endpoints~~ DONE
4. ~~Analytics DAL~~ DONE
5. **SPRINT 0: Run migration 012** — webhook_events, ENUMs→TEXT, locations, skus, inventory_events, orders tables. See docs/SPRINT_PLAN.html.
6. **SPRINT 0: Set up staging** — Neon database branch for staging. Netlify branch deploy for staging branch. 
7. **SPRINT 1: SKU DAL** — lib/dal/skus.js with getByStyle, upsert, getByVariantId. Add fit/size/length dimensions to analytics.js whitelist.
8. **SPRINT 2: Inventory events DAL** — lib/dal/inventory.js with addEvent, getStock, refreshMaterializedView. Replace old store_inventory queries.
9. **SPRINT 3: Orders DAL** — lib/dal/orders.js with create, getById, getByCustomer. Wire PO creation in a transaction (test BEGIN/COMMIT with @netlify/neon first).
10. **SPRINT 4: dbmate** — Replace POST /api/migrate with proper migration tooling.
11. **SPRINT 4: Integration tests** — 10 real tests hitting the staging database. vitest.

**NEXT PHASE — Almond:**
12. **SPRINT 4: Move matchers to DB** — product_matchers table. Sync loads matchers from DB instead of JS module.
13. Stack completeness logic (per PRODUCT_STACK_BUILDER.md)
14. PO stage-specific validation (per PO_WORKFLOW_ENGINE.md)

---

## 6. SHARED FILES

| File | Owner | Others |
|------|-------|--------|
| lib/products.js | Bonney | Read-only |
| lib/constants.js | Almond | Read-only |
| lib/domain.js | Almond | Read-only |
| COORDINATION.md | Peter | Read-only |

Check `git log` before editing shared files. If someone pushed in the last 2 hours, coordinate with Reuven.

---

## 6.5 DESIGN DOCS (read before building)

| Document | What | Who Needs It |
|----------|------|-------------|
| docs/SPRINT_PLAN.html | 22 tasks, 6 sprints, 12 weeks — from senior developer audit. THE ROADMAP. | ALL — read this first |
| docs/ARCHITECTURAL_ENVELOPE.md | 6 patterns for $17M scale — events, documents, users, channels, alerts, workflows | All |
| docs/STRATEGIC_DESIGN.md | PO impact simulation, collections, returns, markdowns, scaling | All |
| docs/PO_WORKFLOW_ENGINE.md | 12-stage PO lifecycle, requirements, deadlines, cash flow | Danny, Almond, Bonney |
| docs/PRODUCT_STACK_BUILDER.md | 10 structured sections, completeness scoring, PO gates | Danny, Almond |
| docs/ANALYTICS_DESIGN.md | Flexible Group By + THEN BY tree | Danny, Almond |
| docs/CASH_FLOW_PROJECTION.md | Weekly inflow + outflow + running position algorithm | Danny, Almond |
| docs/NAVIGATION_ARCHITECTURE.md | Unified DataExplorer with presets | Danny |
| docs/INTELLIGENCE_LAYER.md | Vendor scoring (Gold/Silver/Bronze) + grade computation (A/B/C/D) | Almond |
| docs/STORE_ALLOCATION.md | Velocity-based distribution algorithm | Almond, Danny |
| docs/ARCHITECTURE_AUDIT.md | Issues ranked by risk | All |
| docs/FOUNDATION.md | What the system is, truth chain | All |
| docs/ENGINEERING_PRACTICES.md | How we build: design first | All |
| docs/SYNC_DESIGN.md | Background function architecture | Bonney |

**Rule: READ the design doc BEFORE building the feature. No exceptions.**

---

## 7. CURRENT STATE

**Working:**
- Migration: 7 SQL files execute correctly
- Seed: 41 MPs + 10 vendors
- Sync step 1: 597/1108 products matched to MPs
- Auth: site password (atica2026ops)
- Verification: GET /api/verify grades data A-F
- All 13 pages render, 96 tests pass, build succeeds
- Analytics DAL built (lib/dal/analytics.js)

**Needs verification (Bonney first):**
- Full sync via background function (all 6 steps)
- Styles table populated (597 records)
- Sales table populated (30-day orders)
- Velocity from real data
- Webhook registration

**Missing (addressed by Sprint Plan):**
- SKU-level data (fit/size/length as queryable rows) — Sprint 1
- Event-sourced inventory (replaces empty store_inventory) — Sprint 2
- Proper orders table (AOV, customer link) — Sprint 3
- Webhook deduplication — Sprint 0
- Remaining ENUMs (payment_status etc.) — Sprint 0
- Staging environment — Sprint 0
- Integration tests — Sprint 4
- Real auth (Clerk) — Sprint 6

---

## 7.5 SPRINT PLAN (from senior developer audit)

**Read docs/SPRINT_PLAN.html for full details. 22 tasks, 6 sprints, ~12 weeks.**

| Sprint | Name | When | Key Deliverables |
|--------|------|------|-----------------|
| 0 | Stop the Bleeding | Week 1 | ~~Kill endpoints~~ DONE. Webhook dedup. ~~ENUMs→TEXT~~ partially. Staging. |
| 1 | The SKU Table | Week 2-3 | skus table. Sync populates SKUs from variants. Sales linked to SKUs. Analytics by fit/size. |
| 2 | Event-Sourced Inventory | Week 3-4 | inventory_events table + materialized view. Locations table. Webhook→events. |
| 3 | Orders & Transactions | Week 5-6 | orders table. Webhook creates orders + inventory events. PO transactions. |
| 4 | Reliability | Week 7-8 | Sync reconciliation. dbmate migrations. Integration tests. DB-stored matchers. |
| 5 | Operations Features | Week 9-10 | Transfers on events. PO receiving on events. Store stock lookup screen. |
| 6 | Auth + Cash Flow | Week 11-12 | Clerk auth. Cash flow calibration. Session consolidation. |

**Constraint:** Shopify stays as source of truth. ERP-as-source is Phase 2 (Q3/Q4 2026).

**Migration 012 creates foundation:** webhook_events, locations, skus, inventory_events, orders tables. All ENUMs→TEXT.

---

## 8. PRODUCT HIERARCHY

Product Type → MP → Style → Fit → Size → Length → SKU
41 MPs across 10 categories.

**Domain rules (from Reuven — non-negotiable):**
- HC suits by VENDOR not price: Shandong = HC $360, JYY = Italian HC $480
- Lorenzo/Alexander are FITS, not MPs
- Milano = white-dress. Edinburgh = Royal Oxford = white.
- Knit ≠ Polo (separate MPs)
- Boys: suits and shirts are separate MPs
- Each accessory type = own MP
- Grades: A, B, C, D
- Revenue is $7.5M — not $4.3M
- "Only I know the mapping. It's intuition." — trust Reuven.

---

## 9. GOTCHAS — Production Crashes

- **JSONB**: app_settings.value is JSONB. Neon returns OBJECTS not strings. Do NOT JSON.parse(). Use: `typeof row.value === 'string' ? JSON.parse(row.value) : row.value`
- **JSONB INSERT**: Cast: `VALUES ($1, $2::jsonb)`
- **FK DELETE ORDER**: po_payments → po_stage_history → shipments → styles → store_inventory → sales → product_stack → purchase_orders → master_products → vendors
- **BLOBS CRASH IN NEXT.JS**: `getStore()` only works in `netlify/functions/*.js`. Crashes in app/ routes.
- **REDIRECT KILLS NEXT.JS ROUTES**: netlify.toml `/api/sync/*` redirect → Netlify function. Next.js route at same path = dead code.
- **BACKGROUND NAMING**: `-background` suffix = 15 min. Without = 26 seconds.
- **SHOPIFY API VERSION**: NEVER change 2025-04 without testing against live store.
- **DYNAMIC REQUIRE IN FUNCTIONS**: Must be at top of file, not inside handler. Breaks esbuild bundling.

---

## 10. FILE MAP

```
app/(dashboard)/          — Danny's pages + actions
app/(dashboard)/actions.js — Server actions (data layer for pages)
app/api/                  — API routes (some intercepted by netlify.toml)
lib/dal/                  — Almond's DAL (all SQL lives here)
lib/dal/analytics.js      — Flexible Group By queries (BUILT)
lib/product/              — Almond's product domain module
lib/supply-chain/         — Almond's PO/vendor domain module
lib/finance/              — Almond's finance domain module
lib/products.js           — Bonney's MP seeds + title matchers
lib/shopify.js            — Bonney's Shopify REST client
lib/constants.js          — Almond's shared constants
netlify/functions/        — Bonney's sync + legacy functions
supabase/migrations/      — Almond's schema (7 files)
components/               — Danny's React components
docs/                     — Peter's design docs
docs/ANALYTICS_DESIGN.md  — Flexible analytics spec
docs/ENGINEERING_PRACTICES.md — How we build
docs/FOUNDATION.md        — What the system is
docs/SYNC_DESIGN.md       — Background sync architecture
```

---

## 11. DOCS TO READ

| Who | Must Read |
|-----|-----------|
| Everyone | This file (COORDINATION.md) |
| Bonney | docs/SYNC_DESIGN.md, docs/ANALYTICS_DESIGN.md (task 8) |
| Danny | docs/ANALYTICS_DESIGN.md (task 7), docs/FOUNDATION.md |
| Almond | docs/ENGINEERING_PRACTICES.md, docs/ANALYTICS_DESIGN.md (task 7) |
