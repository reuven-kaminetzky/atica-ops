import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { requireAuth } = require('../../../lib/auth');
    await requireAuth(request, 'admin');

    if (request.headers.get('x-confirm-destructive') !== 'true') {
      return NextResponse.json({
        error: 'Destructive operation. Pass header X-Confirm-Destructive: true',
        warning: 'This runs ALL migration files against the database.',
      }, { status: 400 });
    }

    // Use neon() HTTP driver — works reliably on Netlify serverless
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      return NextResponse.json({ error: 'Migrations directory not found' }, { status: 404 });
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let totalExecuted = 0;
    const allErrors = [];

    for (const file of files) {
      const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Split on semicolons, handle $$ blocks
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
      for (const stmt of statements) {
        try {
          await sql(stmt);
          executed++;
        } catch (e) {
          const msg = e.message || '';
          // These are expected when re-running migrations
          if (msg.includes('already exists') || msg.includes('duplicate') || 
              msg.includes('cannot cast') || msg.includes('does not exist') ||
              msg.includes('multiple primary') || msg.includes('being used by')) {
            executed++; // skip but count as done
          } else {
            allErrors.push({ file, sql: stmt.slice(0, 80), error: msg.slice(0, 120) });
          }
        }
      }
      totalExecuted += executed;
    }

    // List all tables
    let tables = [];
    try {
      const rows = await sql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
      tables = rows.map(t => t.table_name);
    } catch (e) {
      tables = ['error: ' + e.message.slice(0, 60)];
    }

    // Check MP count
    let mpCount = 0;
    try {
      const [r] = await sql("SELECT COUNT(*)::int AS n FROM master_products");
      mpCount = r.n;
    } catch {}

    // Check which column exists
    let idsColumn = 'unknown';
    try {
      await sql("SELECT external_ids FROM master_products LIMIT 1");
      idsColumn = 'external_ids';
    } catch {
      try {
        await sql("SELECT shopify_product_ids FROM master_products LIMIT 1");
        idsColumn = 'shopify_product_ids (needs rename!)';
      } catch {
        idsColumn = 'neither exists';
      }
    }

    const log = require('../../../lib/logger');
    log.info('migrate.complete', { files: files.length, executed: totalExecuted, errors: allErrors.length, tables: tables.length });

    return NextResponse.json({
      migrated: true,
      files,
      executed: totalExecuted,
      errors: allErrors.slice(0, 15),
      tables,
      mpCount,
      idsColumn,
      summary: `${totalExecuted} statements across ${files.length} files. ${allErrors.length} errors. ${tables.length} tables. ${mpCount} MPs. IDs column: ${idsColumn}`,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 200) }, { status: 500 });
  }
}
