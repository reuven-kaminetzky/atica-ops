// ═══════════════════════════════════════════════════════════════
// Stallon: /api/sync/pulse — Lightweight sales pulse
// Only fetches last 24h orders + today's summary
// Designed to run every 3 minutes from the frontend
// Does NOT re-sync products or inventory
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/shopify/client';
import { salesPulse } from '@/lib/shopify/sync';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function POST(req: NextRequest) {
  const client = await createClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, reason: 'Shopify not configured' },
      { status: 503, headers: corsHeaders }
    );
  }

  const result = await salesPulse(client);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: corsHeaders,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
