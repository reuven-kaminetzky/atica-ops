# Migration Plan: Netlify Functions → Next.js + Supabase

> Building for 2 years. This is the roadmap.

## Why We're Moving

| Problem | Current (Netlify Functions) | Target (Next.js + Supabase) |
|---------|---------------------------|----------------------------|
| Database | Blobs (key-value, no queries) | Postgres (SQL, indexes, joins, views) |
| Auth | SKIP_AUTH=true | Supabase Auth + RLS + roles |
| Background jobs | None (10s timeout) | Supabase Edge Functions + pg_cron |
| Real-time | None | Supabase Realtime (WebSocket) |
| File uploads | None | Supabase Storage |
| Cold starts | 3-5s on every function | Persistent server, edge caching |
| Shared state | None (each function isolated) | Shared Postgres connection pool |
| Frontend | Vanilla JS modules | React + Server Components |

## What Transfers (zero rewrites)

These files are pure JavaScript with zero framework dependency:

```
lib/domain.js      451 lines  — MP lifecycle, PO lifecycle, payment types, events
lib/workflow.js    200 lines  — computeMPStatus, buildFactoryPackage, projectCashFlow
lib/effects.js     336 lines  — side effects engine
lib/products.js    319 lines  — MP seeds, matchers, seasonal, demand signals
lib/shopify.js     230 lines  — Shopify client
lib/locations.js    74 lines  — store normalization
lib/inventory.js    56 lines  — shared inventory helpers
test.js            425 lines  — 75 automated tests
```

Total: **2,091 lines of tested business logic that ports as-is.**

## New Stack

```
Next.js 15        — App Router, Server Components, API Routes
Supabase          — Postgres, Auth, Realtime, Storage, Edge Functions
Vercel/Netlify    — Hosting (Next.js deploys to either)
Shopify           — Product/order/inventory source of truth (unchanged)
```

## Database Schema (done)

`supabase/migrations/001_initial_schema.sql` — 500+ lines:

- 14 tables: master_products, product_stack, vendors, purchase_orders,
  po_payments, shipments, customers, wholesale_accounts, components,
  mp_components, campaigns, attachments, audit_log, app_settings
- 8 enums: mp_phase, po_stage, payment_status, demand_signal, etc.
- 3 views: v_active_pos, v_mp_health, v_cash_flow
- 6 triggers: auto-updated_at, auto-audit on stage/phase changes
- RLS enabled on all tables (permissive policies until auth is set up)
- Configurable settings (opex, seasonal multipliers, distribution weights)

## Migration Phases

### Phase 1: Database + API (Week 1-2)
- [ ] Set up Supabase project (or use Netlify DB/Neon)
- [ ] Run schema migration
- [ ] Seed master_products from lib/products.js MP_SEEDS
- [ ] Seed vendors from MP_SEEDS vendor data
- [ ] Create Next.js API routes for: products, purchase-orders, workflow
- [ ] Verify Shopify connection works from Next.js API routes
- [ ] Run legacy + Next.js in parallel (same repo, different deploy)

### Phase 2: Core Frontend (Week 2-4)
- [ ] Dashboard layout with sidebar (React)
- [ ] Products page (server component + Supabase query)
- [ ] MP detail page with product stack editor
- [ ] PO list + PO detail with stage advancement
- [ ] Cash flow page with real-time projection

### Phase 3: Auth + Roles (Week 3-4)
- [ ] Supabase Auth with email/password
- [ ] Role-based access: Admin, Buyer, Finance, Sales, PD
- [ ] RLS policies per role
- [ ] Protected routes in Next.js middleware

### Phase 4: Advanced Features (Week 4-8)
- [ ] File uploads (factory packages, QC reports, sample photos)
- [ ] Real-time PO status updates via Supabase Realtime
- [ ] Background jobs: nightly reorder calculation, payment status refresh
- [ ] Wholesale accounts module
- [ ] Customer module with loyalty tiers
- [ ] Components/BOM module

### Phase 5: Kill Legacy (Week 6-8)
- [ ] Verify all features work in Next.js
- [ ] Redirect /v2 to new app
- [ ] Archive atica_app.html and modules/
- [ ] Remove Netlify Functions

## File Structure (Target)

```
/app
  /layout.js                    ← Root layout with sidebar
  /globals.css                  ← Design system
  /(dashboard)
    /layout.js                  ← Dashboard shell (sidebar + content area)
    /page.js                    ← Home / health dashboard
    /products/page.js           ← MP list
    /products/[id]/page.js      ← MP detail + stack editor
    /purchase-orders/page.js    ← PO list
    /purchase-orders/[id]/page.js ← PO detail + stage advancement
    /cash-flow/page.js          ← Cash flow projection
    /stock/page.js              ← Inventory matrix
    /analytics/page.js          ← Revenue, velocity, demand
    /vendors/page.js            ← Vendor cards
    /settings/page.js           ← Connection, sync, auth
  /api
    /shopify/[...path]/route.js ← Shopify proxy (uses lib/shopify.js)
    /products/route.js          ← Supabase CRUD
    /purchase-orders/route.js   ← Supabase CRUD + effects
    /workflow/route.js          ← Unified status (uses lib/workflow.js)

/lib                            ← SHARED (unchanged from current)
  /domain.js                    ← Schemas
  /workflow.js                  ← Compute
  /effects.js                   ← Side effects
  /products.js                  ← MP seeds + business logic
  /shopify.js                   ← Shopify client
  /supabase.js                  ← Supabase client (NEW)

/supabase
  /migrations/001_initial_schema.sql  ← Database schema

/components                     ← React components
  /ui/                          ← Buttons, inputs, modals, tables
  /products/                    ← MP card, detail, stack editor
  /purchase-orders/             ← PO card, detail, stage track
  /cash-flow/                   ← Projection chart, payment table
```

## Parallel Running

During migration, both systems run simultaneously:

- **Legacy** (current): https://atica-ops.netlify.app/v2
  - Netlify Functions + Blobs
  - Still connected to Shopify
  - Still works for daily operations

- **Next.js** (new): https://atica-ops-v3.netlify.app (or Vercel)
  - Supabase for data
  - Same Shopify connection
  - Gradually gains feature parity

When Next.js has all features, flip the DNS.

## What NOT to Do

1. **Don't rewrite the domain model** — it's tested, framework-agnostic, correct
2. **Don't change Shopify connection** — it works, leave it
3. **Don't migrate data manually** — write seed scripts from MP_SEEDS
4. **Don't build auth from scratch** — use Supabase Auth
5. **Don't over-optimize early** — get features working, then optimize
