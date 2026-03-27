# Answers from Nikita — for Shendrao-san

## Questions

### 1. PLM default stage — "Concept" vs "In-Store"?

Both are correct for different contexts. Seed data = existing products already
selling, so "in_store" is right for those. New MPs created through the UI should
default to "concept". Don't add a flag — just use "concept" as the default in
the PO creation and any future "Create Product" form. The seeds can stay as
"in_store". The schema already defaults to that.

### 2. Payment schedule — preferred default per vendor?

Yes. Add a `preferred_terms` field to the vendors table/data. Default to
"standard" if not set. The vendor module should expose this so PO creation
can auto-select. Schema for v3:

```sql
ALTER TABLE vendors ADD COLUMN preferred_terms TEXT DEFAULT 'standard';
```

For legacy, store it in the vendor blob data. When creating a PO, check:
1. Explicit terms passed in the request → use those
2. Vendor has preferred_terms → use those
3. Fall back to "standard"

### 3. classifyDemand and adjustVelocity — server-side only?

Keep the computation server-side. The API should return the RESULT
(the signal, the adjusted velocity), not the raw data for the frontend
to compute. So:

- GET /api/products returns `signal`, `velocity_per_week`, `days_of_stock`
  already computed
- GET /api/orders/velocity returns computed velocity per SKU
- Frontend modules read the computed values, never import lib/products.js

This way one source of truth for the algorithm. If we change thresholds
in lib/products.js, it takes effect everywhere without frontend redeployment.

### 4. Stock transfer — MP → inventoryItemId mapping?

Build a smarter backend route. Don't make the frontend figure out item IDs.

The route should be:
```
POST /api/transfers
{
  fromLocation: "Reserve",
  toLocation: "Lakewood", 
  items: [{ mpId: "londoner", qty: 15 }]
}
```

The backend resolves mpId → Shopify product → variants → inventory items
internally. The transfer itself is recorded in our transfers table with
mpId references. When we eventually push to Shopify (inventory write-back),
the backend does the Shopify API call to adjust_inventory_level.

Frontend never needs to know inventory item IDs.

### 5. validate — canonical pattern?

Yes. `lib/validate.js` is canonical. It exports:
- `validatePOCreate(body)` → `{ valid, data }` or `{ valid: false, error }`
- `validatePOUpdate(body)` → same
- `validateStageAdvance(body)` → same
- `str(val, maxLen)`, `num(val, fallback)`, `int(val, fallback)` — sanitizers

Every POST/PATCH route calls validate before touching DB.
For legacy Netlify Functions, use the existing `validate` from `lib/handler.js`
which has `validate.required()`, `validate.oneOf()`, etc. Two different
validation systems for two different apps — that's fine until legacy dies.

## Suggestions — Answers

### Event handler wiring on legacy side

YES — do this. Wire the legacy event bus (`modules/event-bus.js`) to call
`refreshPaymentStatuses` when PO stage changes. The legacy events are:
- `po:created` → call refreshPaymentStatuses
- `po:stage-changed` → call refreshPaymentStatuses
- `po:received` → call refreshPaymentStatuses + create receiving log

This makes payments auto-advance without manual refresh. Exactly right.

### Shopify sync button in legacy

YES — one line. Add to `modules/settings.js`. Call `POST /api/sync`.
Show the result JSON. Done.

### store.js hybrid → Postgres for PLM/stack

Not yet. The v3 app reads PLM and stack from Postgres already
(via `product_stack` and `plm_history` tables). The legacy app can
keep using blobs for now. When we kill the legacy site, all blob
stores die with it. Don't invest time migrating blob stores to
Postgres on the legacy side — that work has zero value once v3
replaces v1.

### Vendor scoring → persistent

Good idea. Add it to the vendor blob data on the legacy side for now:
```javascript
// After computing scores
await store.vendors.set(vendorId, { ...vendorData, score: computedScore });
```

On the v3 side, I'll add scoring columns to the vendors table:
```sql
ALTER TABLE vendors ADD COLUMN on_time_pct NUMERIC(5,2);
ALTER TABLE vendors ADD COLUMN avg_lead_days INTEGER;
ALTER TABLE vendors ADD COLUMN quality_score NUMERIC(3,2);
```

The v3 Shopify sync will eventually compute these from order/PO data.

### 12-week projection — seasonal multipliers

Correct — one source of truth. The constants are now in `lib/constants.js`:

```javascript
SEASONAL_MULTIPLIERS: {
  1: 0.85, 2: 0.85, 3: 0.85,
  4: 0.85, 5: 0.85, 6: 0.85,
  7: 1.0,
  8: 1.4, 9: 1.4,
  10: 1.15,
  11: 1.6, 12: 1.6,
}
```

For legacy modules, DON'T import lib/constants.js directly (it's a
CommonJS module, your modules are browser ES modules loaded via script tags).
Instead, have the API return the multiplier in its response:

```
GET /api/orders/velocity?days=30
→ { ..., seasonalMultiplier: 1.4, currentMonth: 8 }
```

Then the frontend uses the returned value. Same source of truth,
no import issues.

## Summary — What San Should Do Next

1. ✅ Finish XSS/escapeHtml/containers (in progress)
2. Wire legacy event bus → refreshPaymentStatuses on PO stage changes
3. Add "Sync from Shopify" button to legacy settings (POST /api/sync)
4. Wire vendor scoring — compute client-side, display with tier badges
5. Wire PO payment display in cash-flow module (read from GET /api/purchase-orders/:id)
6. Add preferred_terms to vendor data
7. Return seasonal multiplier in velocity API response

Don't touch: lib/products.js, lib/domain.js, lib/constants.js,
lib/validate.js, or anything in app/.
