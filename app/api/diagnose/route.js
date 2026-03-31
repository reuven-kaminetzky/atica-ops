import { NextResponse } from 'next/server';

/**
 * GET /api/diagnose — raw database diagnostics
 * Returns exactly what exists. No assumptions. No failures.
 */
export async function GET() {
  const result = { ts: new Date().toISOString(), checks: {} };

  try {
    const { neon } = require('@neondatabase/serverless');
    const db = neon(process.env.NETLIFY_DATABASE_URL);

    // 1. List all tables
    try {
      const tables = await db`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      result.checks.tables = tables.map(t => t.tablename);
    } catch (e) {
      result.checks.tables = `ERROR: ${e.message}`;
    }

    // 2. master_products columns
    try {
      const cols = await db`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='master_products' ORDER BY ordinal_position`;
      result.checks.mp_columns = cols.map(c => `${c.column_name} (${c.data_type})`);
    } catch (e) {
      result.checks.mp_columns = `ERROR: ${e.message}`;
    }

    // 3. Count MPs
    try {
      const [r] = await db`SELECT COUNT(*)::int AS n FROM master_products`;
      result.checks.mp_count = r.n;
    } catch (e) {
      result.checks.mp_count = `ERROR: ${e.message}`;
    }

    // 4. Sample MPs
    try {
      const rows = await db`SELECT id, name, category, total_inventory, hero_image IS NOT NULL as has_image FROM master_products ORDER BY category, name LIMIT 10`;
      result.checks.mp_sample = rows;
    } catch (e) {
      result.checks.mp_sample = `ERROR: ${e.message}`;
    }

    // 5. Check external_ids vs shopify_product_ids
    try {
      await db`SELECT external_ids FROM master_products LIMIT 1`;
      result.checks.ids_column = 'external_ids (migration 005 ran)';
      const [r] = await db`SELECT COUNT(*)::int AS n FROM master_products WHERE external_ids IS NOT NULL AND array_length(external_ids, 1) > 0`;
      result.checks.ids_populated = `${r.n} MPs have external_ids`;
    } catch {
      try {
        await db`SELECT shopify_product_ids FROM master_products LIMIT 1`;
        result.checks.ids_column = 'shopify_product_ids (migration 005 NOT run — this is the bug)';
        const [r] = await db`SELECT COUNT(*)::int AS n FROM master_products WHERE shopify_product_ids IS NOT NULL AND array_length(shopify_product_ids, 1) > 0`;
        result.checks.ids_populated = `${r.n} MPs have shopify_product_ids`;
      } catch {
        result.checks.ids_column = 'NEITHER column exists';
      }
    }

    // 6. Check styles
    try {
      const [r] = await db`SELECT COUNT(*)::int AS n FROM styles`;
      result.checks.styles_count = r.n;
    } catch (e) {
      result.checks.styles_count = `TABLE MISSING: ${e.message.slice(0, 60)}`;
    }

    // 7. Check sales
    try {
      const [r] = await db`SELECT COUNT(*)::int AS n FROM sales`;
      result.checks.sales_count = r.n;
    } catch (e) {
      result.checks.sales_count = `TABLE MISSING: ${e.message.slice(0, 60)}`;
    }

    // 8. Check vendors
    try {
      const [r] = await db`SELECT COUNT(*)::int AS n FROM vendors`;
      result.checks.vendors_count = r.n;
    } catch (e) {
      result.checks.vendors_count = `TABLE MISSING`;
    }

    // 9. Sync status
    try {
      const [r] = await db`SELECT value FROM app_settings WHERE key='sync_status'`;
      result.checks.sync_status = r?.value;
    } catch (e) {
      result.checks.sync_status = `TABLE MISSING`;
    }

    // 10. Check which migrations-created tables exist
    const expectedTables = ['master_products', 'vendors', 'purchase_orders', 'po_payments',
      'styles', 'sales', 'store_inventory', 'product_stack', 'app_settings',
      'audit_log', 'api_tokens', 'alerts', 'customers', 'shipments',
      'webhook_events', 'locations', 'skus', 'inventory_events', 'orders'];
    
    const existingTables = Array.isArray(result.checks.tables) ? result.checks.tables : [];
    result.checks.missing_tables = expectedTables.filter(t => !existingTables.includes(t));
    result.checks.has_all_tables = result.checks.missing_tables.length === 0;

  } catch (e) {
    result.error = `Database connection failed: ${e.message}`;
  }

  return NextResponse.json(result);
}
