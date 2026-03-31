import { NextResponse } from 'next/server';

/**
 * POST /api/webhooks/register
 * 
 * Registers Shopify webhooks pointing to our handler.
 * Run once after deployment. Idempotent.
 */
export async function POST(request) {
  try {
    const { requireAuth } = require('../../../../lib/auth');
    await requireAuth(request, 'admin');

    const { createClient } = require('../../../../lib/shopify');
    const client = await createClient();
    if (!client) return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });

    const baseUrl = process.env.URL || 'https://atica-ops-v3.netlify.app';
    // Point webhooks directly to the Netlify function path.
    // /api/webhooks/shopify redirects through the site password gate.
    // /.netlify/functions/webhooks-shopify is the direct function invoke URL.
    const address = `${baseUrl}/.netlify/functions/webhooks-shopify`;

    const topics = [
      'inventory_levels/update',
      'orders/create',
      'orders/updated',
      'products/update',
      'products/create',
    ];

    // Get existing webhooks
    const existing = await client.getWebhooks();
    const existingTopics = (existing.webhooks || []).map(w => w.topic);

    const results = [];
    for (const topic of topics) {
      if (existingTopics.includes(topic)) {
        results.push({ topic, status: 'already_registered' });
        continue;
      }
      try {
        await client.createWebhook(topic, address);
        results.push({ topic, status: 'registered', address });
      } catch (e) {
        results.push({ topic, status: 'failed', error: e.message.slice(0, 80) });
      }
    }

    return NextResponse.json({ registered: true, address, results });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
