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

**Bonney's tasks:**
1. Verify sync-background.js works end-to-end
2. Confirm 597+ styles created in styles table
3. Confirm sales stored from 30-day order pull
4. Register webhooks (orders/create, inventory/update, products/update)
5. Test webhook handling for real-time updates
6. Review unmatched titles — add matchers for real products missed
7. Expand product matcher coverage past 597/1108
8. VARIANT DATA — Extract Fit/Size/Length from Shopify variant options during sync (for analytics). Coordinate schema with Almond. See docs/ANALYTICS_DESIGN.md.

**NEXT PHASE — Bonney:**
9. **SYNC/WEBHOOK RACE:** Sync and webhooks both write to master_products. Add timestamp guard or sync lock to prevent sync from overwriting newer webhook data. See docs/ARCHITECTURE_AUDIT.md.
10. **DELETE 11 LEGACY FUNCTIONS:** netlify/functions/{customers,finance,inventory,ledger,orders,pos,products,purchase-orders,shipments,status,workflow}.js — 2,753 lines serving nothing. Remove functions + their redirects from netlify.toml. Keep only: sync.js, sync-background.js, daily-sync.mjs, webhooks-shopify.js.
11. **DELETE OLD SYNC ROUTE:** app/api/sync/route.js (11K lines, never executes due to netlify.toml redirect).
12. **PO RECEIVED WEBHOOK:** When PO hits stage 11 (received), update inventory on master_products. See docs/PO_WORKFLOW_ENGINE.md.

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

**NEXT PHASE — Danny (read design docs BEFORE building):**
9. **PO WORKFLOW:** Read docs/PO_WORKFLOW_ENGINE.md. Rebuild PO detail as stage-specific workflow. Each stage shows ONLY the fields for that stage. Advance button disabled until requirements met. Deadline tracking. Cash flow impact panel.
10. **STACK BUILDER:** Read docs/PRODUCT_STACK_BUILDER.md. Rebuild stack editor with 10 structured sections, per-section completeness, required field markers. Show stack gate status on PO detail.
11. **UNIFIED DATA EXPLORER:** Read docs/NAVIGATION_ARCHITECTURE.md. Products/Stock/Vendors/Analytics become ONE component with different default presets.

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

**Almond's tasks:**
1. Run migration 007 (drops 8 premature tables)
2. Verify DAL queries work after cleanup
3. Auth tokens on API routes (SKIP_AUTH=true is not acceptable)
4. CI pipeline: GitHub Action for tests (needs PAT with workflow scope)
5. Structured logging across all routes
6. Verification endpoint refinement
7. **ANALYTICS DAL:** lib/dal/analytics.js is BUILT. Review it. getBreakdown() supports 6 dimensions + 9 metrics. See docs/ANALYTICS_DESIGN.md.
8. Cash flow DAL: real po_payments + sales queries
9. **Run migration 010** (sales unique constraint — prevents duplicate sales on re-sync)
10. Add DAL methods Danny or Bonney request

**NEXT PHASE — Almond (read design docs BEFORE building):**
11. **PO SCHEMA:** Read docs/PO_WORKFLOW_ENGINE.md. Migration adding 20+ columns to purchase_orders (stage-specific data: sample_images, qc_report, margin_pct, received_quantity, etc.). Update PO DAL with stage-specific validation — each stage checks its required fields before allowing advancement.
12. **STACK COMPLETENESS:** Read docs/PRODUCT_STACK_BUILDER.md. Add sections JSONB to product_stack. Write completeness calculation in lib/product/ (per-section scoring, weighted overall). Wire gate check into advanceStage — PO can't advance past Design without Construction+Fit at 100%.
13. **PROTECT DESTRUCTIVE ENDPOINTS:** POST /api/seed and POST /api/migrate can wipe the database. Add admin token check. See docs/ARCHITECTURE_AUDIT.md.
14. **PO TRANSACTIONS:** Wrap PO creation (purchase_orders + po_payments + po_stage_history) in BEGIN/COMMIT/ROLLBACK.

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
| docs/ANALYTICS_DESIGN.md | Flexible Group By + THEN BY tree (ATCM/Lightspeed R model) | Danny, Almond |
| docs/PO_WORKFLOW_ENGINE.md | 12-stage PO lifecycle, stage-specific requirements, deadlines, cash flow | Danny, Almond, Bonney |
| docs/PRODUCT_STACK_BUILDER.md | 10 structured sections, completeness scoring, PO gates | Danny, Almond |
| docs/NAVIGATION_ARCHITECTURE.md | Products/Stock/Vendors/Analytics = one flexible view | Danny |
| docs/ARCHITECTURE_AUDIT.md | 9 issues ranked by risk — what will break | All |
| docs/FOUNDATION.md | What the system is, truth chain, schema tiers | All |
| docs/ENGINEERING_PRACTICES.md | How we build: design first, one commit | All |
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

**Missing:**
- FOB/retail on ~12 new MPs (zegna, loro-piana etc. = $0)
- API auth (SKIP_AUTH=true)
- CI pipeline
- Per-store inventory
- Variant data (fit/size/length) for analytics

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
