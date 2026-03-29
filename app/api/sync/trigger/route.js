import { NextResponse } from 'next/server';

/**
 * POST /api/sync/trigger
 * 
 * Triggers the sync background function.
 * Sets initial status in Blob store. Returns immediately.
 */
export async function POST() {
  try {
    // Set initial status in Blob
    const { getStore } = require('@netlify/blobs');
    const store = getStore('sync');
    await store.setJSON('sync-status', {
      status: 'starting',
      startedAt: new Date().toISOString(),
      triggeredBy: 'manual',
      updatedAt: new Date().toISOString(),
    });

    // Trigger background function
    const siteUrl = process.env.URL || 'https://atica-ops-v3.netlify.app';
    const bgRes = await fetch(`${siteUrl}/.netlify/functions/sync-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'manual' }),
    });

    return NextResponse.json({
      triggered: true,
      backgroundStatus: bgRes.status,
      message: 'Sync started. Poll /api/sync/status for progress.',
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
