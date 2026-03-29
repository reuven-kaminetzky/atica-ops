import { NextResponse } from 'next/server';

/**
 * POST /api/sync/trigger
 * 
 * Triggers the sync background function.
 * Sets initial status in database (NOT Blobs — Blobs don't work in Next.js routes).
 */
export async function POST() {
  try {
    const { sql } = require('../../../../lib/dal/db');
    const db = sql();

    // Guard: don't trigger if already running
    const [current] = await db`SELECT value FROM app_settings WHERE key = 'sync_status'`;
    if (current) {
      const status = JSON.parse(current.value);
      if (status.status === 'running') {
        return NextResponse.json({ triggered: false, message: 'Sync already running', step: status.step });
      }
    }

    // Set initial status
    const value = JSON.stringify({ status: 'starting', startedAt: new Date().toISOString(), triggeredBy: 'manual', updatedAt: new Date().toISOString() });
    await db`INSERT INTO app_settings (key, value) VALUES ('sync_status', ${value}) ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()`;

    // Trigger background function
    const siteUrl = process.env.URL || 'https://atica-ops-v3.netlify.app';
    const bgRes = await fetch(`${siteUrl}/.netlify/functions/sync-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'manual' }),
    });

    return NextResponse.json({ triggered: true, backgroundStatus: bgRes.status, message: 'Sync started. Poll /api/sync/status for progress.' });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
