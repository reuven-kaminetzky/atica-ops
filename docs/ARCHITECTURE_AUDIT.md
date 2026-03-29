# Architecture Audit — Where the Spine Will Break

## CRITICAL

### 1. Sales Table Has No Unique Constraint
**Risk:** Running sync twice doubles all sales data. Velocity doubles. Revenue doubles.
**File:** `supabase/migrations/006_store_inventory_and_sales.sql`
**Fix:** Migration 010 — unique index on (order_shopify_id, COALESCE(sku, title, ''))
**Owner:** Almond

### 2. Seed/Migrate Endpoints Unprotected  
**Risk:** Anyone with site password can wipe the database.
**Fix:** Add admin token check or remove routes entirely.
**Owner:** Almond

### 3. No Transaction on PO Creation
**Risk:** Failed payment generation = orphaned PO with no payment schedule.
**Fix:** Wrap PO + payments + stage_history in BEGIN/COMMIT/ROLLBACK.
**Owner:** Almond

## SERIOUS

### 4. Sync and Webhooks Race on master_products
**Risk:** Sync overwrites webhook's more recent inventory update.
**Fix:** Timestamp guard or sync lock via app_settings.
**Owner:** Bonney

### 5. 11 Legacy Netlify Functions (2,753 lines dead code)
**Risk:** Wasted deploy time, session confusion.
**Fix:** Delete functions + remove redirects from netlify.toml.
**Owner:** Bonney

### 6. Old Sync Route (app/api/sync/route.js)
**Risk:** Dead code confusion. netlify.toml redirect means it never runs.
**Fix:** Delete.
**Owner:** Bonney

## DESIGN DEBT

### 7. No Variant-Level Data for Full Analytics
**Status:** Bonney shipped variant option extraction in commit 9daad78.
Needs schema + DAL integration.

### 8. Cash Flow Uses Static Formulas
**Status:** Almond built sales DAL + payments DAL. Danny needs to wire.

### 9. No Staging Environment
**Fix:** Branch deploys on Netlify. Careful with shared database.
