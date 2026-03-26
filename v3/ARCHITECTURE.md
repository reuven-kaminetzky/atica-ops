# Atica Ops v3 — Architecture

## Stack Decision

| Layer | v2 (old) | v3 (new) | Why |
|-------|----------|----------|-----|
| **Frontend** | Vanilla JS modules | Next.js 15 (App Router) | SSR, middleware, React ecosystem |
| **API** | Netlify Functions (65 routes) | Next.js Route Handlers | Same server, no cold starts, shared state |
| **Database** | Netlify Blobs + Neon | Supabase Postgres | Auth, RLS, real-time, file storage, cron |
| **Auth** | SKIP_AUTH=true | Supabase Auth | Multi-user, roles (Admin/Buyer/Finance/PD) |
| **File Storage** | None | Supabase Storage | Factory packages, sample photos, QC reports |
| **Real-time** | None | Supabase Realtime | PO status updates, inventory changes |
| **Background Jobs** | None | Supabase Edge Functions + pg_cron | Nightly reorder, payment status refresh |
| **Shopify** | lib/shopify.js | Same client, ported | No change needed |
| **Hosting** | Netlify | Vercel or Netlify | Both support Next.js |

## What Transfers (zero rewrite)

```
lib/domain.js    → src/lib/domain/index.ts    (451 lines → TypeScript)
lib/workflow.js  → src/lib/domain/workflow.ts  (200 lines)
lib/effects.js   → src/lib/domain/effects.ts   (336 lines)
lib/products.js  → src/lib/domain/products.ts  (319 lines)
lib/locations.js → src/lib/domain/locations.ts (74 lines)
lib/shopify.js   → src/lib/shopify/client.ts   (230 lines)
test.js          → tests/domain.test.ts         (425 lines)
```

Total: ~2,000 lines of business logic port directly. This is the valuable IP.

## Database Schema (Supabase Postgres)

```sql
-- Core entities
purchase_orders     — indexed on mp_id, vendor, stage, created_at
po_payments         — FK to purchase_orders, indexed on due_date, status
shipments           — FK to purchase_orders
plm_stages          — MP lifecycle tracking
product_stack       — tech pack data per MP (7 sections)
audit_log           — every change tracked

-- New (impossible with Blobs)
wholesale_accounts  — credit limits, terms, discount rates
components          — BOM: fabric, lining, buttons per MP
campaigns           — marketing campaigns
customer_profiles   — loyalty tier, sizes, purchase history
vendor_scores       — on-time %, quality score, tier
```

## Auth & Roles

```
Admin    — full access
Buyer    — products, POs, vendors, production planning
Finance  — cash flow, AP/AR, PO costing approval, margins
PD       — product development, sampling, QC, PLM advancement
Sales    — POS feed, customer profiles, analytics
Ops      — inventory, transfers, shipments, distribution
```

Row-Level Security (RLS) on Supabase ensures each role only sees what they should.

## File Structure

```
src/
  app/
    layout.tsx              — root layout with auth provider
    (auth)/
      login/page.tsx        — login page
      callback/route.ts     — Supabase auth callback
    (dashboard)/
      layout.tsx            — sidebar + topbar (authenticated)
      page.tsx              — home/command center
      products/page.tsx     — master products
      products/[id]/page.tsx — MP detail + product stack
      purchase-orders/page.tsx
      purchase-orders/[id]/page.tsx
      cash-flow/page.tsx
      inventory/page.tsx
      vendors/page.tsx
      analytics/page.tsx
      settings/page.tsx
    api/
      products/route.ts     — GET/POST products
      products/[id]/route.ts
      products/[id]/stack/route.ts
      products/[id]/factory-package/route.ts
      purchase-orders/route.ts
      purchase-orders/[id]/route.ts
      purchase-orders/[id]/stage/route.ts
      purchase-orders/[id]/payments/route.ts
      workflow/status/route.ts
      workflow/health/route.ts
      finance/projection/route.ts
      finance/margins/route.ts
      shopify/sync/route.ts
      shopify/webhooks/route.ts
  lib/
    domain/
      index.ts              — MP_LIFECYCLE, PO_LIFECYCLE, events, relations
      products.ts           — MP seeds, matchers, seasonal, demand
      workflow.ts            — computeMPStatus, buildFactoryPackage, projectCashFlow
      effects.ts             — side effects engine
      locations.ts           — store normalization
    db/
      index.ts               — Supabase client
      schema.sql             — full schema
      queries.ts             — typed query functions
      migrate.ts             — migration runner
    shopify/
      client.ts              — Shopify REST client
      mappers.ts             — product/order transforms
    auth/
      middleware.ts           — auth middleware for API routes
      roles.ts                — role definitions + permissions
  components/
    ui/                       — shadcn/ui components
    layout/
      sidebar.tsx
      topbar.tsx
    products/
      product-card.tsx
      product-detail.tsx
      stack-editor.tsx
    purchase-orders/
      po-table.tsx
      po-detail.tsx
      stage-tracker.tsx
    cash-flow/
      projection-chart.tsx
      payment-schedule.tsx
  hooks/
    use-products.ts           — SWR/React Query hook
    use-purchase-orders.ts
    use-realtime.ts           — Supabase realtime subscription
supabase/
  migrations/
    001_initial.sql           — core tables
    002_rls.sql               — row-level security policies
    003_functions.sql         — database functions + triggers
  seed.sql                    — MP seeds, test data
```

## Data Flow (v3)

```
Browser → Next.js Server → Supabase Postgres (direct SQL)
                         → Shopify REST API (products, orders, inventory)
                         → Supabase Storage (files)
                         → Supabase Realtime (subscriptions)

Supabase Edge Functions → pg_cron:
  - Nightly: refresh reorder plan, snapshot inventory
  - Hourly: refresh payment statuses (planned→upcoming→due→overdue)
  - On PO stage change: fire side effects (trigger function)
```

## Migration Plan

1. **Phase 1** (now): Scaffold Next.js + Supabase, port domain model, create schema
2. **Phase 2**: Build API routes using Supabase queries (replace Netlify Functions)
3. **Phase 3**: Build dashboard pages (products, POs, cash flow)
4. **Phase 4**: Add auth, roles, RLS
5. **Phase 5**: Add real-time, file storage, background jobs
6. **Phase 6**: Shopify webhook receiver, POS feed
7. **Phase 7**: Kill v2, redirect atica-ops.netlify.app → new domain

v2 stays live throughout. No downtime.
