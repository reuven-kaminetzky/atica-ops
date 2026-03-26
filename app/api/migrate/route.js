import { NextResponse } from 'next/server';
import { neon } from '@netlify/neon';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const sql = neon();
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
    if (!fs.existsSync(migrationPath)) {
      return NextResponse.json({ error: 'Migration file not found' }, { status: 404 });
    }

    const migration = fs.readFileSync(migrationPath, 'utf8');
    const statements = migration.split(';').map(s => s.trim()).filter(s => s.length > 10 && !s.startsWith('--'));

    let executed = 0;
    const errors = [];
    for (const stmt of statements) {
      try {
        await sql(stmt);
        executed++;
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          executed++;
        } else {
          errors.push({ sql: stmt.slice(0, 60), error: msg.slice(0, 100) });
        }
      }
    }

    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    return NextResponse.json({ migrated: true, executed, total: statements.length, errors: errors.slice(0, 10), tables: tables.map(t => t.table_name) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
