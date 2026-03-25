# CONTRIBUTING — Atica Ops

## Branch structure

```
main          ← PROTECTED. Production. Never push here directly.
dev           ← Merge target. All PRs go here first.
feat/stallon-api       ← Stallon: /netlify/functions/, /lib/
feat/deshawn-cashflow  ← Deshawn: renderFinCashflow, renderTrunkCF, PO payments, OTB
feat/shrek-mp          ← Shrek: renderProducts, renderProductDetail, MP cards
feat/nikita-modular    ← Nikita: modules/, atica_v2.html, event-bus
```

## How to push your work

1. Work on your feature branch only
2. PR your branch → `dev`
3. Once `dev` is tested, PR `dev` → `main`
4. **Never push directly to main** — it's protected and will reject

## Who owns what — hard boundaries

| Session | Branch | Files |
|---------|--------|-------|
| Stallon | `feat/stallon-api` | `netlify/functions/*.js`, `lib/*.js` |
| Deshawn | `feat/deshawn-cashflow` | `atica_app.html` (CF + PO sections only) |
| Shrek | `feat/shrek-mp` | `atica_app.html` (Products + MP sections only) |
| Nikita | `feat/nikita-modular` | `modules/`, `atica_v2.html`, `docs/` |
| Deshawn (gates) | already on main | `_checkStageGate`, `advanceStageUI` — DO NOT TOUCH |

## Current state of main (commit 14c463f)

- Data version: **v32**
- Stage gates: **live and enforced** — all 6 transitions gated
- `_checkStageGate` is a **global function**, not on Store — call it as `_checkStageGate()` not `Store._checkStageGate()`
- Cash flow D object: **dynamically computed** from real PO payments + Shopify inflow
- Shopify endpoints live: `/api/shopify/draft-orders`, `/api/shopify/inventory/adjust`
- Integrity: **23/23 checks passing**

## The collision that happened

Stallon and Deshawn's sessions were both editing `atica_app.html` on main simultaneously.
Stallon's syntax fixes clobbered gate logic. Deshawn's regex pass introduced a velocity parse error.
Both are fixed in commit `5ed18e9`. **This is why branches exist.**

## Deshawn's next task (feat/deshawn-cashflow)
- Wire `D.outTotals` to pull vendor payment rows from REAL_AP_INVOICES dynamically
- PO payment status: `projected` → `upcoming` when ETD is confirmed  
- Cash flow month detail: clicking a month cell opens breakdown

## Stallon's next task (feat/stallon-api)  
- When PO advances to stage 6 (in-transit), auto-push container + vessel to shipment record
- `POST /api/shopify/inventory/adjust` endpoint is live — wire it to transfer completion in frontend

## Shrek's next task (feat/shrek-mp)
- MP cards: use `Store.getInventoryFor(p.id)` for stock — not the proportional estimate
- Style-level stock breakdown: real variant inventory from Shopify sync

## Nikita's next task (feat/nikita-modular)
- Modular skeleton already on main in `modules/` and `netlify/functions/`
- Do NOT rebuild from scratch — build on what's there
- Event bus is at `modules/event-bus.js`
- When a module is ready, test against `atica_v2.html` (not main's `atica_app.html`)
