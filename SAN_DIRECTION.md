# Direction Change — for Shendrao-san

## Legacy is dead. Stop all work on modules/*.js and atica_app.html.

Reuven decided: v3 (Next.js + Postgres) is the app. The legacy monolith
is being killed. Every line you write in modules/ is throwaway work.

## Your new tasks (all in v3 codebase)

Read COORDINATION.md for full details. Summary:

1. **Automated verification endpoint** — POST /api/verify
   System validates its own data integrity after sync.
   Reuven should never manually check if sync worked.

2. **Daily sync scheduled function** — Netlify background function
   Runs at 5 AM UTC. Syncs products/inventory/orders + verifies.

3. **Authentication** — at minimum site password on v3.
   SKIP_AUTH=true on a $4.3M ERP is not acceptable.

4. **Dashboard with real data** — app/(dashboard)/page.js
   5 cards: inventory value, top velocity, PO pipeline, payments due, stock alerts.

5. **Structured logging** — JSON logs for every sync/webhook/error.

6. **CI pipeline** — GitHub Action running `node test.js` on push.

7. **Cash flow from real data** — po_payments + sales table, not formulas.

## What you should NOT touch

- modules/*.js (legacy, being killed)
- atica_app.html (legacy monolith)
- lib/products.js title matchers (Reuven's domain, ask him first)

## What you CAN touch

- app/ (Next.js pages and API routes)
- lib/ (domain modules, DAL, etc.)
- components/ (React components)
- netlify/functions/ (only for scheduled/background functions)
- supabase/migrations/ (schema changes)
- test.js (add tests)

## Architecture rules

1. Pages read data through server actions (app/(dashboard)/actions.js)
2. Server actions call domain modules (lib/product/, lib/supply-chain/, etc.)
3. Domain modules call DAL (lib/dal/)
4. DAL calls Postgres via @netlify/neon
5. No raw SQL outside lib/dal/
6. API routes exist only for external callers (webhooks, sync, health, verify)
