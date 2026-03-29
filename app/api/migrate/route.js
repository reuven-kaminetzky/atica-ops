import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { requireAuth } = require('../../../lib/auth');
    await requireAuth(request, 'admin');

    const { Pool } = require('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });

    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      return NextResponse.json({ error: 'Migrations directory not found' }, { status: 404 });
    }

    // Run all .sql files in order
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let totalExecuted = 0;
    const allErrors = [];
    const allTables = [];

    for (const file of files) {
      const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Split carefully — handle $$ function bodies
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
          await pool.query(stmt);
          executed++;
        } catch (e) {
          const msg = e.message || '';
          if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('cannot cast')) {
            executed++;
          } else {
            allErrors.push({ file, sql: stmt.slice(0, 60), error: msg.slice(0, 100) });
          }
        }
      }
      totalExecuted += executed;
    }

    // List all tables
    const { rows: tables } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );

    await pool.end();

    const log = require('../../../lib/logger');
    log.info('migrate.complete', { files: files.length, executed: totalExecuted, errors: allErrors.length, tables: tables.length });

    return NextResponse.json({
      migrated: true,
      files: files,
      executed: totalExecuted,
      errors: allErrors.slice(0, 10),
      tables: tables.map(t => t.table_name),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
