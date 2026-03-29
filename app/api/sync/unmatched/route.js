import { NextResponse } from 'next/server';

/**
 * GET /api/sync/unmatched
 * 
 * Returns the list of Shopify products that didn't match any MP.
 * Stored in Blob by the sync background function.
 */
export async function GET() {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('sync');
    const data = await store.get('unmatched-titles', { type: 'json' });
    if (!data) return NextResponse.json({ count: 0, titles: [], message: 'Run sync first.' });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
