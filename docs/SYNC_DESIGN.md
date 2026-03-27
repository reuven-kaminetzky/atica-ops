# Sync Design Spec

## Problem

Shopify sync needs to process 1,108 products, match to 41 MPs,
create ~600 style records, pull inventory and orders. This takes
30-60 seconds. Netlify serverless functions timeout at 26 seconds.

## Previous (wrong) approaches

1. Single sync endpoint → timed out
2. Split into 3 steps → step 1 worked, step 2 timed out
3. Split into 4 steps → step 1 worked, styles still timed out
4. Delegate styles to background function → untested imports, hacky

## Correct approach

**The sync is a background function.** Not a serverless function.
Background functions get 15 minutes. That's plenty.

### Architecture

```
UI (Settings page)
  │
  ├── Click "Sync from Shopify"
  │     └── POST /api/sync/trigger → returns { jobId, status: 'started' }
  │         └── Triggers background function via internal HTTP
  │
  ├── Poll /api/sync/status every 5 seconds
  │     └── Reads sync_status from app_settings
  │     └── Returns { status: 'running'|'done'|'failed', progress, results }
  │
  └── Show results when done

Background Function (sync-background.mjs)
  │
  ├── Step 1: Fetch products from Shopify
  │   └── Update sync_status: { step: 'products', progress: '0/1108' }
  │
  ├── Step 2: Match products to MPs
  │   └── Update sync_status: { step: 'matching', matched: 597 }
  │
  ├── Step 3: Update master_products (external_ids, hero_image, inventory)
  │   └── 41 UPDATE queries
  │
  ├── Step 4: Upsert styles (batch INSERT)
  │   └── ~600 records in batches of 50
  │   └── Update sync_status: { step: 'styles', created: 450 }
  │
  ├── Step 5: Fetch orders (30 days)
  │   └── Store in sales table
  │   └── Compute velocity per MP
  │   └── Update sync_status: { step: 'orders', stored: 1200 }
  │
  ├── Step 6: Verify
  │   └── Run verification checks
  │   └── Store final results
  │
  └── Update sync_status: { status: 'done', results: {...} }
```

### Data contracts

**POST /api/sync/trigger**
Request: `{}`
Response: `{ triggered: true, message: 'Sync started. Poll /api/sync/status for progress.' }`

**GET /api/sync/status**
Response (running): 
```json
{
  "status": "running",
  "step": "styles",
  "progress": "Created 450/597 styles",
  "startedAt": "2026-03-27T21:00:00Z",
  "elapsed": "25s"
}
```

Response (done):
```json
{
  "status": "done",
  "results": {
    "products": 1108,
    "matched": 597,
    "styles": 597,
    "orders": 1200,
    "velocity": 28,
    "verification": { "grade": "B", "score": 75 }
  },
  "elapsed": "45s",
  "completedAt": "2026-03-27T21:00:45Z"
}
```

### Style batch INSERT

Instead of 597 individual INSERTs, use batches:

```sql
-- One INSERT per batch of 50 rows
INSERT INTO styles (id, mp_id, external_product_id, title, colorway, ...)
VALUES ($1, $2, $3, $4, $5, ...),
       ($6, $7, $8, $9, $10, ...),
       ...
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, ...
```

This requires using Pool (not tagged template) for dynamic VALUES.
~12 batch INSERTs instead of 597 individual ones.

### Domain ownership

- Sync trigger API route: `app/api/sync/trigger/route.js`
- Sync status API route: `app/api/sync/status/route.js`
- Background function: `netlify/functions/sync-background.mjs`
- Status storage: `app_settings` table (key: 'sync_status')
- DAL methods needed:
  - `dashboard.setSetting('sync_status', {...})` — exists
  - `dashboard.getSetting('sync_status')` — exists
  - `products.upsertStyleBatch(styles[])` — new, uses Pool
  - `products.updateShopifyData(id, ids, image)` — exists
  - `products.updateTotalInventory(id, stock)` — exists
  - `products.updateVelocity(id, data)` — exists

### Files to create/modify

1. `app/api/sync/trigger/route.js` — new (thin, just triggers background)
2. `app/api/sync/status/route.js` — new (reads from app_settings)
3. `netlify/functions/sync-background.mjs` — new (the actual sync logic)
4. `lib/dal/products.js` — add upsertStyleBatch method
5. `app/(dashboard)/settings/page.js` — update UI to trigger + poll
6. Remove old `app/api/sync/route.js` (the one we rewrote 5 times)

### Testing plan

Before pushing:
1. Verify background function imports work locally
2. Verify batch INSERT SQL is correct
3. Verify status polling works
4. Verify verification endpoint runs after sync

### What this replaces

- `app/api/sync/route.js` (5 rewrites, step-based, hacky)
- `netlify/functions/sync-all-background.mjs` (untested imports)
- All the step-based UI (4 buttons that may or may not work)

One button. One background function. Proper status reporting.
