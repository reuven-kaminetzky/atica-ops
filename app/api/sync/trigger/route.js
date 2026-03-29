import { NextResponse } from 'next/server';

/**
 * POST /api/sync/trigger
 * 
 * Triggers the sync background function.
 * Sets initial status in Blob store. Returns immediately.
 */
export async function POST() {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('sync');

    // Guard: don't trigger if already running
    const current = await store.get('sync-status', { type: 'json' }).catch(() => null);
    if (current && current.status === 'running') {
      return NextResponse.json({
        triggered: false,
        message: 'Sync already running',
        step: current.step,
      });
    }

    // Set initial status in Blob
    await store.setJSON('sync-status', {
      status: 'starting',
      startedAt: new Date().toISOString(),
      triggeredBy: 'manual',
      updatedAt: new Date().toISOString(),
    });

    // Trigger background function
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://atica-ops.netlify.app';
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
