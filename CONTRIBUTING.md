# Contributing to Atica Ops

## Git Workflow

```bash
git pull origin main          # Always pull first
# ... make changes ...
node --check <file>           # Every JS file you touched
git add -A && git commit -m "type: description"
git push origin main
```

Commit types: `feat:`, `fix:`, `refactor:`, `arch:`, `docs:`, `chore:`

Everyone pushes to main directly. No branch protection (yet). Pull before working.

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
  { method: 'GET', path: ':id', handler: getById },    // static paths before :params
];
exports.handler = createHandler(ROUTES, 'my-prefix');
```

### Input Validation

```javascript
validate.required(body, ['vendor', 'units', 'mpId']);           // throws 400
validate.days(params);                                          // default 30, max 365
validate.days(params, 90);                                      // default 90
validate.intParam(params, 'limit', { min: 1, max: 200, fallback: 50 });
```

**Never** do: `const days = parseInt(params.days || '30', 10);`

### Error Handling

```javascript
throw new RouteError(400, 'Units must be positive');   // expected — user sees message
throw new RouteError(404, `PO not found: ${id}`);      // expected — 404
// Unexpected errors: just let them throw, handler catches and returns 500
```

### Persistence

| Data | Where |
|------|-------|
| Products, orders, inventory | Shopify + in-memory cache |
| Purchase orders | `store.po` (Netlify Blobs) |
| Shipments | `store.shipments` |
| PLM stages | `store.plm` |
| **Never** | `let _data = []` — dies on cold start |

### Business Logic (lib/products.js)

```javascript
// Seasonal velocity adjustment
const adjusted = adjustVelocity(rawVelocity, month);  // 0.85x–1.6x by season

// Demand signal classification
const signal = classifyDemand(sellThrough, velocityPerWeek);  // hot/rising/steady/slow

// Distribution weights for incoming PO stock
const allocation = suggestDistribution(totalUnits);  // {Lakewood:30, Flatbush:20, ...}

// Landed cost
const landed = landedCost(fob, dutyPct);  // FOB × (1 + duty% + 8% freight)

// MP matching
const mpId = matchProduct('Londoner White Shirt');  // → 'londoner'
const { matched, unmatched } = matchAll(shopifyProducts);
```

## Frontend Patterns

### Module Lifecycle

```javascript
import { on, emit } from './event-bus.js';
import { api, formatCurrency, skeleton } from './core.js';

let state = { loaded: false };
let _container = null;

export async function init(container) {
  _container = container;
  container.innerHTML = `<div id="my-content">${skeleton(6)}</div>`;
  // fetch data, render
}

export function destroy() {
  _container = null;
  state = { loaded: false };
}
```

### Event Bus

```javascript
// Subscribe at TOP LEVEL (ES modules load once)
// Guard with _container check
on('sync:complete', async () => {
  if (!_container) return;
  // refresh...
});

// Emit
emit('toast:show', { message: 'Done', type: 'success' });
emit('modal:open', { title: 'Edit', html: '...', onMount: (body) => { } });
```

### API Client

```javascript
const data = await api.get('/api/products/masters');
const data = await api.get('/api/orders/sales', { days: 30 });
const result = await api.post('/api/purchase-orders', { mpId: 'londoner' });
await api.patch(`/api/purchase-orders/${id}`, { vendor: 'TAL' });
```

**Never** use raw `fetch()` in modules.

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| `let _data = []` for persistent data | `store.po.put(key, value)` |
| `parseInt(params.days)` unbounded | `validate.days(params)` |
| `fetch('/api/...')` in modules | `api.get('/api/...')` |
| Import between modules | Event bus: `emit('event', data)` |
| Inline store names | `lib/locations.js normalize()` |
| Inline title matchers | `lib/products.js matchProduct()` |
| `throw new Error()` in handlers | `throw new RouteError(400, msg)` |
| Build modal inline | `emit('modal:open', { html, onMount })` |
