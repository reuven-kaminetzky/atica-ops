import { NextResponse } from 'next/server';

/**
 * GET /api/sync/status
 * 
 * Returns sync status from database.
 * Note: app_settings.value is JSONB — Neon returns it as an object already.
 */
export async function GET() {
  try {
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();
    const [row] = await db`SELECT value FROM app_settings WHERE key = 'sync_status'`;
    if (!row) return NextResponse.json({ status: 'never_run', message: 'No sync has been run yet.' });
    // value is JSONB — already parsed by Neon, don't JSON.parse again
    return NextResponse.json(typeof row.value === 'string' ? JSON.parse(row.value) : row.value);
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 });
  }
}
