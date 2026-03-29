# Atica Man OPS — Team Coordination

**THERE IS NO LEGACY APP. The monolith (atica_app.html, modules/*.js, atica_v2.html) has been DELETED from the repo. The only app is Next.js in app/. If you see references to modules/ or atica_app.html anywhere — ignore them. Those files do not exist.**

## Team

| Session | Role | Scope |
|---------|------|-------|
| **Peter** | Architecture | Design docs, data contracts, reviews. Does NOT write code. |
| **Bonney** | Data Pipeline | Sync, Shopify API, background functions, Blobs, matchers. |
| **Danny** | Frontend | Pages, components, server actions, UI/UX. |
| **Almond** | Backend/Infra | DAL, schema, auth, CI, logging, verification, webhooks. |

---

## File Ownership

### Peter (Architecture — no code)
```
READS:    docs/*, COORDINATION.md, lib/domain.js, lib/constants.js
WRITES:   docs/*.md, COORDINATION.md
DOES NOT: Write application code, push commits to app/ or lib/
```

### Bonney (Data Pipeline)
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

**IMPORTANT: /api/sync/* routes go through netlify.toml redirect to netlify/functions/sync.js.
Do NOT create Next.js routes under app/api/sync/ — they will never run.**

**Bonney's tasks (in order):**
1. Verify sync-background.js works end-to-end on deployed site
2. Confirm 597+ styles created in styles table
3. Confirm sales stored from 30-day order pull
4. Register webhooks (orders/create, inventory/update, products/update)
5. Test webhook handling for real-time updates
6. Review unmatched titles — add matchers for real products missed
7. Expand product matcher coverage past 597/1108
8. VARIANT DATA SYNC — Read docs/ANALYTICS_DESIGN.md. Analytics needs Fit, Size, Length from Shopify variant options. Extract during sync. Coordinate schema with Almond.

### Danny (Frontend)
```
OWNS:     app/(dashboard)/*.js  (all pages)
          app/(dashboard)/actions.js  (server actions)
          app/(dashboard)/layout.js
          components/*.js
DO NOT TOUCH: lib/products.js, netlify/functions/, lib/dal/, supabase/
```

**UX PHILOSOPHY (from Reuven — mandatory):**
- DO NOT build dashboards full of random data. No KPI cards. No sparklines. No charts on the home page.
- Reuven wants to LOOK for data when he needs it — drill-down, not data dump.
- Think Odoo: clean tree navigation. Click to go deeper. Surface is minimal.
- Landing page: clean entry points into the tree (Products, POs, Stock, Cash Flow). Only show alerts if something needs action (stockout, overdue). Nothing else.
- Pattern: List view (table) → click row → Detail view → click section → Sub-detail.
- Each page starts clean. Data appears when you navigate TO it, not when it's thrown at you.
- Functional, not pretty. Clean, not busy. This is a TOOL, not a dashboard.
- **ANALYTICS = the power tool.** Read docs/ANALYTICS_DESIGN.md. Reference: aticm.com + Lightspeed R.

**Danny's tasks (in order):**
1. Rebuild landing page: clean nav entry points + action alerts only.
2. Products: clean table. Click row → detail.
3. Product detail: header, collapsible sections (Styles, POs, Stack).
4. PO list: table. Click row → PO detail.
5. Settings: verify sync polling UI works.
6. Cash flow: table of weekly outflow from real data.
7. **ANALYTICS PAGE (big build):** Read docs/ANALYTICS_DESIGN.md. Flexible data breakdown: Group By pills (Category/Vendor/Product/Color/Fit/Size/Length/Location), stackable THEN BY chain, collapsible tree table, configurable columns, date range filters. Start flat, add tree nesting, then column picker.
8. Mobile: test all pages on phone, fix layouts.

**Danny calls data through:**
Server actions (actions.js) → domain modules (lib/product/) → DAL (lib/dal/).
Danny NEVER writes SQL. If Danny needs data that actions.js doesn't provide,
ask Almond to add a DAL method and expose it via a server action.

### Almond (Backend & Infrastructure)
```
OWNS:     lib/dal/*.js  (all DAL files)
          supabase/migrations/*.sql
          app/api/verify/route.js
          app/api/migrate/route.js
          app/api/seed/route.js
          lib/logger.js, lib/auth.js, lib/validate.js
          lib/constants.js, lib/domain.js
          lib/events.js, lib/event-handlers.js
          lib/product/, lib/supply-chain/, lib/finance/
          lib/inventory/, lib/sales/, lib/logistics/, lib/marketing/
DO NOT TOUCH: app/(dashboard)/ pages, lib/products.js, lib/shopify.js,
              netlify/functions/sync-background.js
```

**Almond's tasks (in order):**
1. Run migration 007 (schema cleanup — drops 8 premature tables)
2. Verify all DAL queries work after cleanup
3. Add auth tokens on API routes (beyond site password)
4. CI pipeline: GitHub Action for tests on push
5. Structured logging across all routes
6. Verification endpoint refinement
7. **ANALYTICS DAL:** Read docs/ANALYTICS_DESIGN.md. Build lib/dal/analytics.js with getBreakdown(groupBy, thenBy, filters). Dynamic GROUP BY queries — the most complex DAL method. Design before coding.
8. Cash flow DAL: real po_payments + sales queries
9. Add DAL methods Danny or Bonney request

---

## Shared Files — coordinate before editing

| File | Owner | Others |
|------|-------|--------|
| lib/products.js | Bonney | Read-only for all others |
| lib/constants.js | Almond | Bonney/Danny read |
| lib/domain.js | Almond | All read |
| COORDINATION.md | Peter | All read |
| docs/*.md | Peter | All read |

---

## Engineering Rules

1. **Design before code** — write the spec, then implement
2. **One commit, one purpose** — each commit does ONE thing
3. **Test before push** — `node --check`, `node test.js`, `npx next build`
4. **Never edit files outside your zone** without coordination
5. **Reuven's domain corrections override everything**
6. **No new npm dependencies** without asking Peter

---

## GOTCHAS — These Caused Production Crashes

- **JSONB**: `app_settings.value` is JSONB. Neon returns **parsed objects**, not strings. Do NOT call `JSON.parse()` on it. Use: `typeof row.value === 'string' ? JSON.parse(row.value) : row.value`
- **JSONB INSERT**: Cast with `::jsonb`: `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)`
- **FK DELETE ORDER**: Delete children before parents: po_payments → po_stage_history → shipments → styles → store_inventory → sales → product_stack → purchase_orders → master_products → vendors
- **BLOBS**: `getStore()` crashes in Next.js server routes. Only use Blobs inside `netlify/functions/*.js` files.
- **REDIRECT INTERCEPTION**: `netlify.toml` redirects `/api/sync/*`, `/api/products/*`, etc. to Netlify Functions. Next.js routes at those paths are **dead code** that never runs.
- **BACKGROUND NAMING**: Filename must end with `-background` for 15 min timeout. `sync-background.js` = 15 min. `sync.js` = 26 seconds.
- **UX**: No KPI cards, no dashboards. Drill-down navigation. Data appears when you navigate TO it.
