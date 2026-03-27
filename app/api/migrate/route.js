import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    // Pool supports raw SQL strings (neon() only supports tagged templates)
    const { Pool } = require('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });

    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
    if (!fs.existsSync(migrationPath)) {
      return NextResponse.json({ error: 'Migration file not found' }, { status: 404 });
    }

    const migration = fs.readFileSync(migrationPath, 'utf8');

    // Split carefully — handle $$ function bodies that contain semicolons
    const statements = [];
    let current = '';
    let inDollarQuote = false;

    for (const line of migration.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) continue;

      if (trimmed.includes('$$')) {
        inDollarQuote = !inDollarQuote;
      }

      current += line + '\n';

      if (!inDollarQuote && trimmed.endsWith(';')) {
        const stmt = current.trim();
        if (stmt.length > 5) statements.push(stmt.replace(/;$/, ''));
        current = '';
      }
    }

    let executed = 0;
    const errors = [];

    for (const stmt of statements) {
      try {
        await pool.query(stmt);
        executed++;
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('cannot cast')) {
          executed++;
        } else {
          errors.push({ sql: stmt.slice(0, 80), error: msg.slice(0, 120) });
        }
      }
    }

    // Verify tables
    const { rows: tables } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );

    await pool.end();

    return NextResponse.json({
      migrated: true,
      executed,
      total: statements.length,
      errors: errors.slice(0, 10),
      tables: tables.map(t => t.table_name),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
