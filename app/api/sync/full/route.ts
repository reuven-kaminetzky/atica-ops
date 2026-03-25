// ═══════════════════════════════════════════════════════════════
// Stallon: /api/sync/full — Full Shopify sync
// Products + Inventory + Orders + Velocity + Sales
// Called on boot and manual "Sync now" button
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/shopify/client';
import { fullSync } from '@/lib/shopify/sync';

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

  const result = await fullSync(client);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
    headers: corsHeaders,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
