# Atica Man OPS — Team Coordination

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
OWNS:     netlify/functions/sync-background.js
          netlify/functions/daily-sync.mjs
          app/api/sync/*  (trigger, status, unmatched)
          app/api/webhooks/*  (shopify receiver, register)
          lib/shopify.js
          lib/products.js  (MP seeds, title matchers, demand logic)
DO NOT TOUCH: app/(dashboard)/ pages, lib/dal/, supabase/migrations/
```

**Bonney's tasks (in order):**
1. Verify sync-background.js works end-to-end on deployed site
2. Confirm 597+ styles created in styles table
3. Confirm sales stored from 30-day order pull
4. Register webhooks (orders/create, inventory/update, products/update)
5. Test webhook handling for real-time updates
6. Review unmatched titles — add matchers for real products missed
7. Expand product matcher coverage past 597/1108

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

**Danny's tasks (in order):**
1. Rebuild landing page: REMOVE KPI cards and data dump. Clean nav entry points + action alerts only.
2. Products: clean table (name, category, stock, velocity). Click row → detail.
3. Product detail: header with key numbers, collapsible sections (Styles, POs, Stack).
4. PO list: table. Click row → PO detail with stage track and payments.
5. Settings: verify sync polling UI works with Blob-based status.
6. Cash flow: table of weekly outflow from real po_payments + sales. Not charts.
7. Mobile: test all pages on phone, fix layouts.

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
7. Add DAL methods Danny or Bonney request
8. Cash flow DAL: real po_payments + sales queries

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
