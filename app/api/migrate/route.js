import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const { neon } = require('@netlify/neon');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ error: 'No DATABASE_URL' }, { status: 500 });

    const sql = neon(url);

    // Read migration file
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
    
    if (!fs.existsSync(migrationPath)) {
      return NextResponse.json({ error: 'Migration file not found' }, { status: 404 });
    }

    const migration = fs.readFileSync(migrationPath, 'utf8');

    // Split into statements, filter empty ones
    const statements = migration
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 10 && !s.startsWith('--'));

    let executed = 0;
    const errors = [];

    for (const stmt of statements) {
      try {
        await sql(stmt);
        executed++;
      } catch (e) {
        // Skip "already exists" errors — idempotent migration
        const msg = e.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('cannot cast')) {
          executed++; // count as success — already done
        } else {
          errors.push({ statement: stmt.slice(0, 80) + '...', error: msg.slice(0, 120) });
        }
      }
    }

    // Verify tables exist
    const tables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;

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
