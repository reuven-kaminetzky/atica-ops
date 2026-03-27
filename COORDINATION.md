# Atica Ops — Session Coordination

> Updated: 2026-03-27 by Nikita
> Read this before writing ANY code.

## Two Apps, One Repo

| App | URL | Stack | Status |
|-----|-----|-------|--------|
| **v1 (legacy)** | atica-ops.netlify.app | Static HTML + Netlify Functions | LIVE — being maintained |
| **v3 (next)** | atica-ops-v3.netlify.app | Next.js + Neon Postgres + Tailwind | LIVE — active development |

Both deploy from the same repo (`main` branch).
Both are live. Both serve real users. Don't break either.

## File Ownership — WHO CAN TOUCH WHAT

### Shendrao-san (Claude Code)
```
OWNS:       modules/*.js, modules/core.js, css/
CAN EDIT:   netlify/functions/*.js
DO NOT TOUCH: app/, lib/dal/, lib/product/, lib/supply-chain/,
              lib/inventory/, lib/sales/, lib/finance/,
              lib/logistics/, lib/marketing/,
              lib/events.js, lib/event-handlers.js,
              lib/validate.js, lib/constants.js
```
**Current work:** XSS fixes, escapeHtml, stale container guards,
magic number extraction in legacy modules. All correct. Keep going.

### Nikita (this project, architecture session)
```
OWNS:       app/, lib/dal/, lib/product/, lib/supply-chain/,
            lib/inventory/, lib/sales/, lib/finance/,
            lib/logistics/, lib/marketing/, lib/events.js,
            lib/event-handlers.js, lib/validate.js, lib/constants.js,
            components/, supabase/, docs/, instrumentation.js
CAN EDIT:   lib/shopify.js, lib/locations.js (shared)
DO NOT TOUCH: modules/*.js, netlify/functions/*.js
```
**Current work:** v3 app — domain modules, Tailwind UI, Shopify sync,
event wiring, security hardening.

### SHARED FILES — coordinate before editing
```
lib/products.js    — MP seeds, matchers, demand logic (used by BOTH apps)
lib/domain.js      — lifecycle schemas (used by BOTH apps)
lib/workflow.js    — compute functions (used by BOTH apps)
lib/effects.js     — side effects (used by BOTH apps)
lib/shopify.js     — Shopify REST client (used by BOTH apps)
lib/locations.js   — store normalization (used by BOTH apps)
```
If you need to edit a shared file, check git log first.
If someone pushed to it in the last 2 hours, coordinate with Reuven.

### Shrek, Deshawn, Stallon (project sessions)
These sessions were built for the legacy monolith. If reactivated:
- Read docs/ENGINEERING.md first
- Work in your assigned domain directory (see below)
- Do NOT edit files outside your domain

## Seven Domains

| Domain | Directory | Owner | Status |
|--------|-----------|-------|--------|
| Product | lib/product/ | Shrek | index.js done, re-exports from lib/products.js |
| Supply Chain | lib/supply-chain/ | Deshawn | index.js done, wraps dal/purchase-orders + vendors + payments |
| Inventory | lib/inventory/ | Nikita | index.js stub |
| Sales | lib/sales/ | Stallon | index.js stub |
| Finance | lib/finance/ | — | index.js done, wraps dal/payments + workflow |
| Logistics | lib/logistics/ | — | index.js done (259 lines), tables in 002_logistics.sql |
| Marketing | lib/marketing/ | — | index.js stub |

## What's Been Done (v3)

### Infrastructure
- [x] Next.js app deployed at atica-ops-v3.netlify.app
- [x] Neon Postgres — 16 tables, 3 views, 6 triggers, 4 logistics tables
- [x] Tailwind v4 design system with custom tokens
- [x] 75 automated tests (node test.js)
- [x] Domain-driven architecture (7 domains)

### Pages (20 routes)
- [x] Dashboard — live health stats, nav tiles
- [x] Products — category-grouped cards, margin/stock badges
- [x] Product detail — metrics, stack, POs, PLM history
- [x] Purchase Orders — stage pipeline, create button
- [x] PO detail — 12-stage track, gate checks, payments, history
- [x] PO creation form — vendor/pricing/logistics/terms
- [x] Vendors — cards with PO rollup
- [x] Cash Flow — 12-week projection, active POs
- [x] Stock — inventory table with signals
- [x] Analytics — category breakdown, PO pipeline
- [x] Settings — migration, seed, Shopify sync

### API
- [x] GET/POST /api/purchase-orders
- [x] GET/PATCH /api/purchase-orders/[id]
- [x] POST /api/purchase-orders/[id]/stage
- [x] POST /api/sync (Shopify → Postgres)
- [x] POST /api/migrate, POST /api/seed
- [x] GET /api/health

### Security (commit 3aa8aa0)
- [x] SQL injection fixed (logistics — killed db.unsafe)
- [x] Race condition fixed (PO stage — atomic WHERE guard)
- [x] Input validation on all write routes (lib/validate.js)
- [x] Type safety — all parseInt/parseFloat have fallbacks
- [x] Magic numbers → lib/constants.js

### Events
- [x] Event bus (lib/events.js — 35 event types)
- [x] Event handlers wired (lib/event-handlers.js)
- [x] Audit middleware persists every event
- [x] instrumentation.js initializes on server startup

## What's NOT Done Yet

### High Priority
- [ ] Run 002_logistics.sql migration (Settings → Run Migration)
- [ ] Test Shopify sync (Settings → Sync from Shopify)
- [ ] Wire constants.js into products.js/workflow.js
- [ ] Event subscribers that actually DO things (currently log only)

### Medium Priority
- [ ] Shopify write-back (push inventory adjustments)
- [ ] Warehouse perspective page
- [ ] Store perspective page
- [ ] Real-time updates (polling or Supabase Realtime)

### Future
- [ ] Auth + role-based perspectives
- [ ] Google Ads / Meta Ads adapters
- [ ] RFID integration
- [ ] Kill legacy site when v3 has full parity

## Key Technical Decisions

1. **DAL owns all SQL.** 30 queries, all in lib/dal/. Zero SQL in pages or routes.
2. **Domains don't import each other.** Communication through events only.
3. **Pages are thin.** Call domain → render with Tailwind. No logic.
4. **API routes validate first.** lib/validate.js before any database write.
5. **Atomic stage advances.** WHERE stage = currentStage prevents races.
6. **Perspectives ≠ domains.** Stores read from all domains, own no data.
7. **Legacy stays until v3 has parity.** Don't delete modules/ or netlify/functions/ yet.

## Git Workflow

Push to `main`. Both sites auto-deploy.
Check `git log --oneline -5` before starting work.
If someone pushed in the last hour, pull first.
If you're editing a shared file, tell Reuven.
