import { NextResponse } from 'next/server';

/**
 * GET /api/sync/status
 * 
 * Returns current sync status from app_settings.
 * The background function updates this as it progresses.
 */
export async function GET() {
  try {
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();

    const [row] = await db`SELECT value FROM app_settings WHERE key = 'sync_status'`;
    if (!row) {
      return NextResponse.json({ status: 'never_run', message: 'No sync has been run yet.' });
    }

    const status = JSON.parse(row.value);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 });
  }
}
