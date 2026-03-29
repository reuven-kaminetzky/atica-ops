import { NextResponse } from 'next/server';

/**
 * GET /api/sync/unmatched
 * Returns unmatched Shopify product titles from last sync.
 */
export async function GET() {
  try {
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();
    const [row] = await db`SELECT value FROM app_settings WHERE key = 'unmatched_titles'`;
    if (!row) return NextResponse.json({ count: 0, titles: [], message: 'Run sync first.' });
    return NextResponse.json(JSON.parse(row.value));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
