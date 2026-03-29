import { NextResponse } from 'next/server';

/**
 * GET /api/sync/status
 * 
 * Returns sync status from database.
 * Blobs don't work inside Next.js routes — use app_settings table.
 */
export async function GET() {
  try {
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();
    const [row] = await db`SELECT value FROM app_settings WHERE key = 'sync_status'`;
    if (!row) return NextResponse.json({ status: 'never_run', message: 'No sync has been run yet.' });
    return NextResponse.json(JSON.parse(row.value));
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 });
  }
}
