# Contributing to Atica Ops

## Architecture — Three Layers

```
┌──────────────────────────────────────────────────────────┐
│  LAYER 1: DOMAIN MODEL  (lib/domain.js — 451 lines)     │
│  WHAT things are. Schemas, stages, relationships.        │
│  MP_LIFECYCLE, PO_LIFECYCLE, PAYMENT_TYPES,              │
│  FACTORY_PACKAGE_SECTIONS, ENTITY_RELATIONS,             │
│  CASH_FLOW_CONFIG, MP_STATUS_RULES, DOMAIN_EVENTS        │
├──────────────────────────────────────────────────────────┤
│  LAYER 2: COMPUTE  (lib/workflow.js — 200 lines)         │
│  HOW things work. Pure functions, no side effects.       │
│  computeMPStatus(), buildFactoryPackage(),               │
│  projectCashFlow()                                       │
├──────────────────────────────────────────────────────────┤
│  LAYER 3: EFFECTS  (lib/effects.js — 336 lines)          │
│  WHAT HAPPENS when state changes. Returns actions.       │
│  onPOStageAdvanced(), onMPStageAdvanced(),               │
│  generatePaymentSchedule(), executeAction()              │
│  Pure: effect(ctx) → {actions[], logs[]}                 │
│  Caller decides whether to commit.                       │
└──────────────────────────────────────────────────────────┘
```

**Rule: domain.js is read-only reference. workflow.js computes. effects.js reacts. Netlify functions orchestrate.**

## Data Flow

```
MP seed (lib/products.js)
  ↓ matchAll() → Shopify products
  ↓ computeMPStatus() → unified health
  ↓
PO created (store.po)
  ↓ generatePaymentSchedule() → payments[]
  ↓ onPOStageAdvanced() → side effects
  ↓   → shipment:auto-create (at "In Transit")
  ↓   → mp:advance (at "Ordered")
  ↓   → distribution:suggest (at "Received")
  ↓
Cash Flow (computed, not stored)
  ← PO payments (planned outflow)
  ← Shopify orders (actual inflow)
  → projectCashFlow() → 3-month projection
```

## Backend Patterns

### Every Netlify Function

```javascript
const { createHandler, RouteError, validate } = require('../../lib/handler');
const cache = require('../../lib/cache');

async function myHandler(client, { params, body, pathParams }) {
  const days = validate.days(params);
  validate.required(body, ['vendor', 'units']);

  const ck = cache.makeKey('my-data', { days });
  const cached = cache.get(ck);
  if (cached) return cached;

  const result = { /* ... */ };
  cache.set(ck, result, cache.CACHE_TTL.products);
  return result;
}

const ROUTES = [
  { method: 'GET', path: '',    handler: myHandler },
  { method: 'GET', path: ':id', handler: getById },
];
exports.handler = createHandler(ROUTES, 'my-prefix');
```

### Input Validation

```javascript
validate.required(body, ['vendor', 'units']);
validate.days(params);              // default 30, max 365
validate.days(params, 90);          // custom default
validate.intParam(params, 'limit', { min: 1, max: 200, fallback: 50 });
```

### Error Handling

```javascript
throw new RouteError(400, 'Units must be positive');   // expected
throw new RouteError(404, `PO not found: ${id}`);      // 404
// Unexpected errors: let them throw, handler returns 500
```

### Persistence

| Data | Where | Notes |
|------|-------|-------|
| Products, orders, inventory | Shopify + cache | Source of truth |
| Purchase orders | `store.po` | Netlify Blobs |
| Shipments | `store.shipments` | Auto-created at PO "In Transit" |
| PLM stages | `store.plm` | MP lifecycle tracking |
| Product stack | `store.stack` | Tech pack data (materials, sizing, QC) |
| Snapshots | `store.snapshots` | Inventory snapshots |
| Settings | `store.settings` | App config |

### Side Effects

```javascript
// In purchase-orders.js stage advancement:
const effects = onPOStageAdvanced(po, fromStage, toStage);
// effects.actions = [{ type: 'shipment:create', data: {...} }, ...]
// effects.logs = [{ event: 'po:shipped', ...}]
for (const action of effects.actions) {
  await executeAction(action, store);
}
```

## Frontend Patterns

### Module Lifecycle

```javascript
import { on, emit } from './event-bus.js';
import { api, formatCurrency, skeleton } from './core.js';

let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `<div id="content">${skeleton(6)}</div>`;
  // fetch data, render
}

export function destroy() { _container = null; }
```

### Event Bus

```javascript
on('sync:complete', async () => { if (!_container) return; /* refresh */ });
emit('toast:show', { message: 'Done', type: 'success' });
emit('modal:open', { title: 'Edit', html: '...', onMount: (body) => { } });
```

### API Client

```javascript
const data = await api.get('/api/products/masters');
const result = await api.post('/api/purchase-orders', { mpId: 'londoner' });
await api.patch(`/api/purchase-orders/${id}`, { vendor: 'TAL' });
```

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| `let _data = []` persistent data | `store.po.put(key, value)` |
| `parseInt(params.days)` unbounded | `validate.days(params)` |
| `fetch()` in modules | `api.get()` from core.js |
| Import between modules | Event bus |
| Inline store names | `lib/locations.js` |
| `throw new Error()` in handlers | `throw new RouteError(400, msg)` |
| Redefine schemas | Import from `lib/domain.js` |
| Side effects in compute | Return actions from `lib/effects.js` |

## Git

```bash
git pull origin main
# make changes
node --check <file>     # every JS file
git add -A && git commit -m "type: description"
git push origin main
```

Types: `feat:`, `fix:`, `refactor:`, `arch:`, `docs:`, `chore:`
