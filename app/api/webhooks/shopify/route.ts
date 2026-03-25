// ═══════════════════════════════════════════════════════════════
// Stallon: Shopify webhook handler
//
// Verifies HMAC, routes events to appropriate handlers.
// Events: orders/create, orders/updated, products/update,
//         inventory_levels/update
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── HMAC verification ─────────────────────────────────────────

function verifyWebhook(body: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[Webhook] No SHOPIFY_WEBHOOK_SECRET set — skipping verification');
    return true; // allow in dev
  }
  if (!hmacHeader) return false;

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

// ── Event handlers ────────────────────────────────────────────

interface WebhookEvent {
  topic: string;
  shopDomain: string;
  payload: any;
  receivedAt: string;
}

async function handleOrderCreate(event: WebhookEvent) {
  const order = event.payload;
  console.log(`[Webhook] Order created: ${order.name} — $${order.total_price} — ${order.line_items?.length || 0} items`);

  // Forward to Deshawn's cash-flow if configured
  const forwardUrl = process.env.WEBHOOK_FORWARD_URL;
  if (forwardUrl) {
    try {
      await fetch(`${forwardUrl}/order-created`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': process.env.WEBHOOK_FORWARD_SECRET || '',
          'X-Webhook-Topic': event.topic,
        },
        body: JSON.stringify(event),
      });
    } catch (e: any) {
      console.warn('[Webhook] Forward failed:', e.message);
    }
  }

  return { processed: true, orderId: order.id, orderName: order.name };
}

async function handleOrderUpdated(event: WebhookEvent) {
  const order = event.payload;
  console.log(`[Webhook] Order updated: ${order.name} — financial: ${order.financial_status}, fulfillment: ${order.fulfillment_status}`);
  return { processed: true, orderId: order.id, status: order.financial_status };
}

async function handleProductUpdate(event: WebhookEvent) {
  const product = event.payload;
  console.log(`[Webhook] Product updated: ${product.title} — ${product.variants?.length || 0} variants`);
  return { processed: true, productId: product.id, title: product.title };
}

async function handleInventoryUpdate(event: WebhookEvent) {
  const level = event.payload;
  console.log(`[Webhook] Inventory update: item ${level.inventory_item_id} at location ${level.location_id} → ${level.available}`);
  return {
    processed: true,
    inventoryItemId: level.inventory_item_id,
    locationId: level.location_id,
    available: level.available,
  };
}

const HANDLERS: Record<string, (event: WebhookEvent) => Promise<any>> = {
  'orders/create': handleOrderCreate,
  'orders/updated': handleOrderUpdated,
  'products/update': handleProductUpdate,
  'inventory_levels/update': handleInventoryUpdate,
};

// ── Next.js route ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  const topic = req.headers.get('x-shopify-topic') || 'unknown';
  const domain = req.headers.get('x-shopify-shop-domain') || 'unknown';

  // Verify
  if (!verifyWebhook(rawBody, hmac)) {
    console.warn(`[Webhook] HMAC verification failed for ${topic}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401, headers: corsHeaders });
  }

  // Parse
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  const event: WebhookEvent = {
    topic,
    shopDomain: domain,
    payload,
    receivedAt: new Date().toISOString(),
  };

  // Route to handler
  const handler = HANDLERS[topic];
  if (!handler) {
    console.log(`[Webhook] Unhandled topic: ${topic}`);
    return NextResponse.json({ received: true, topic, handled: false }, { status: 200, headers: corsHeaders });
  }

  try {
    const result = await handler(event);
    return NextResponse.json({ received: true, topic, ...result }, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error(`[Webhook] Error handling ${topic}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
