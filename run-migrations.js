#!/usr/bin/env node
/**
 * run-migrations.js — Standalone migration runner
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node run-migrations.js
 *   DATABASE_URL="postgresql://..." node run-migrations.js 005  # run from 005 onward
 *
 * Uses @neondatabase/serverless directly (not @netlify/neon)
 * so it works outside of Netlify runtime.
 */

const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const connStr = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
if (!connStr) {
  console.error('ERROR: Set DATABASE_URL or NETLIFY_DATABASE_URL');
  process.exit(1);
}

const startFrom = process.argv[2] || null; // e.g. "005"

async function run() {
  const sql = neon(connStr);

  // Test connection
  try {
    await sql`SELECT 1 AS ok`;
    console.log('Connected to database.');
  } catch (e) {
    console.error('Connection failed:', e.message);
    process.exit(1);
  }

  // Check current state
  try {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'master_products'
      ORDER BY ordinal_position
    `;
    const colNames = cols.map(c => c.column_name);
    console.log('\nmaster_products columns:', colNames.join(', '));
    console.log('Has external_ids:', colNames.includes('external_ids'));
    console.log('Has shopify_product_ids:', colNames.includes('shopify_product_ids'));

    const [count] = await sql`
      SELECT count(*) AS total,
        count(CASE WHEN external_ids IS NOT NULL AND array_length(external_ids, 1) > 0 THEN 1 END) AS with_ids
      FROM master_products
    `.catch(() => [{ total: '?', with_ids: '?' }]);
    console.log(`master_products: ${count.total} total, ${count.with_ids} with external_ids populated`);
  } catch (e) {
    console.log('Could not check master_products:', e.message.slice(0, 80));
  }

  // Load and run migrations
  const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => !startFrom || f >= startFrom);

  console.log(`\nRunning ${files.length} migration files...`);

  let totalExecuted = 0;
  const errors = [];

  for (const file of files) {
    const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Split statements (handle $$ blocks)
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    for (const line of migration.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) continue;
      if (trimmed.includes('$$')) inDollarQuote = !inDollarQuote;
      current += line + '\n';
      if (!inDollarQuote && trimmed.endsWith(';')) {
        const stmt = current.trim();
        if (stmt.length > 5) statements.push(stmt.replace(/;$/, ''));
        current = '';
      }
    }

    let executed = 0;
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
        executed++;
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate') ||
            msg.includes('cannot cast') || msg.includes('does not exist')) {
          skipped++;
          executed++;
        } else {
          errors.push({ file, sql: stmt.slice(0, 80), error: msg.slice(0, 120) });
        }
      }
    }
    totalExecuted += executed;
    const status = skipped > 0 ? `(${skipped} already applied)` : '';
    console.log(`  ${file}: ${executed}/${statements.length} statements ${status}`);
  }

  console.log(`\nTotal: ${totalExecuted} executed, ${errors.length} errors`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) {
      console.log(`  ${e.file}: ${e.error}`);
      console.log(`    SQL: ${e.sql}`);
    }
  }

  // Final check
  try {
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `;
    console.log(`\nTables (${tables.length}):`, tables.map(t => t.table_name).join(', '));
  } catch (e) {
    console.log('Could not list tables:', e.message);
  }

  console.log('\nDone. Now trigger sync from Settings page.');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
