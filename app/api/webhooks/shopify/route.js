import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/webhooks/shopify
 * 
 * Real-time updates from Shopify → domain modules → Postgres.
 * Architecture: webhook → product domain + events → DAL → DB
 */
export async function POST(request) {
  try {
    const body = await request.text();
    const topic = request.headers.get('x-shopify-topic') || 'unknown';
    const hmac = request.headers.get('x-shopify-hmac-sha256');

    // Verify signature
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (secret && hmac) {
      const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
      if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const log = require('../../../../lib/logger');
    const payload = JSON.parse(body);
    const product = require('../../../../lib/product');
    const { emit, Events } = require('../../../../lib/events');

    log.info('webhook.received', { topic, shopifyId: payload.id || payload.inventory_item_id });

    let result = { topic, received: true };

    // ── inventory_levels/update ─────────────────────────────
    if (topic === 'inventory_levels/update') {
      // We don't have a per-item mapping yet. Full reconciliation on next sync.
      result.inventory = { itemId: payload.inventory_item_id, available: payload.available };
    }

    // ── orders/create ───────────────────────────────────────
    if (topic === 'orders/create') {
      const items = [];
      for (const li of (payload.line_items || [])) {
        const mpId = li.title ? product.matchProduct(li.title) : null;
        if (mpId) {
          items.push({ mpId, sku: li.sku, qty: li.quantity, price: parseFloat(li.price || 0) });
          await product.deductInventory(mpId, li.quantity);
        }
      }

      if (items.length > 0) {
        await emit(Events.SALE_RECORDED, {
          orderId: payload.name || payload.id,
          store: payload.source_name === 'pos' ? 'POS' : 'Online',
          total: parseFloat(payload.total_price || 0),
          items,
        });
      }

      result.order = { name: payload.name, total: payload.total_price, items: items.length };
    }

    // ── products/update ─────────────────────────────────────
    if (topic === 'products/update' || topic === 'products/create') {
      const maxPrice = Math.max(...(payload.variants || []).map(v => parseFloat(v.price) || 0), 0);
      const mpId = product.matchProduct(payload.title, maxPrice);
      if (mpId && payload.image?.src) {
        await product.updateShopifyData(mpId, [payload.id], payload.image.src);
        result.product = { mpId, image: true };
      }
    }

    log.info('webhook.processed', { topic, result });
    return NextResponse.json(result);
  } catch (e) {
    const log = require('../../../../lib/logger');
    log.error('webhook.error', { error: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
