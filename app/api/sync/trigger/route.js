import { NextResponse } from 'next/server';

/**
 * POST /api/sync/trigger
 * 
 * Triggers the sync background function.
 * Returns immediately. UI polls /api/sync/status for progress.
 */
export async function POST() {
  try {
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();

    // Set initial status
    const value = JSON.stringify({
      status: 'starting',
      startedAt: new Date().toISOString(),
      triggeredBy: 'manual',
      updatedAt: new Date().toISOString(),
    });
    await db`
      INSERT INTO app_settings (key, value) VALUES ('sync_status', ${value})
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `;

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
