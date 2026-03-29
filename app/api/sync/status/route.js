import { NextResponse } from 'next/server';

/**
 * GET /api/sync/status
 * 
 * Returns sync status from Netlify Blob store.
 * Falls back to database if blob not found.
 */
export async function GET() {
  try {
    // Try Blob first (fast)
    const { getStore } = require('@netlify/blobs');
    const store = getStore('sync');
    const status = await store.get('sync-status', { type: 'json' });
    if (status) return NextResponse.json(status);

    // Fallback to database
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();
    const [row] = await db`SELECT value FROM app_settings WHERE key = 'sync_status'`;
    if (row) return NextResponse.json(JSON.parse(row.value));

    return NextResponse.json({ status: 'never_run', message: 'No sync has been run yet.' });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 });
  }
}
