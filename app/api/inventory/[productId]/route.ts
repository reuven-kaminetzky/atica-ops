// ═══════════════════════════════════════════════════════════════
// Stallon: /api/inventory/[productId] — Per-product inventory by store
// Returns { productId, title, stores: { Lakewood: { available, variants }, ... } }
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/shopify/client';
import { getProductInventory } from '@/lib/shopify/sync';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export async function GET(
  req: NextRequest,
  { params }: { params: { productId: string } }
) {
  const client = await createClient();
  if (!client) {
    return NextResponse.json(
      { error: 'Shopify not configured' },
      { status: 503, headers: corsHeaders }
    );
  }

  const productId = parseInt(params.productId, 10);
  if (isNaN(productId)) {
    return NextResponse.json(
      { error: 'Invalid product ID' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const result = await getProductInventory(client, productId);
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
