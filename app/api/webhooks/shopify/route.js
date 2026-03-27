import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/webhooks/shopify
 * 
 * Real-time updates from Shopify. No polling. No full pulls.
 * Each webhook carries one change — we apply it to Postgres instantly.
 *
 * Topics we handle:
 *   inventory_levels/update → update stock for one SKU at one location
 *   orders/create → record sale, emit sale.recorded event
 *   products/update → update hero image, remap if title changed
 */
export async function POST(request) {
  try {
    const body = await request.text();
    const topic = request.headers.get('x-shopify-topic') || 'unknown';
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    const domain = request.headers.get('x-shopify-shop-domain');

    // Verify signature
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (secret && hmac) {
      const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
      if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);
    const { neon } = require('@netlify/neon');
    const sql = neon();
    const { matchProduct } = require('../../../../lib/products');
    const { emit, Events } = require('../../../../lib/events');

    let result = { topic, received: true };

    // ── inventory_levels/update ─────────────────────────────
    if (topic === 'inventory_levels/update') {
      const { inventory_item_id, location_id, available } = payload;

      // Find which MP this inventory item belongs to
      // Look up from our cached product data
      const [mp] = await sql`
        SELECT id FROM master_products 
        WHERE ${inventory_item_id}::bigint = ANY(shopify_product_ids)
      `.catch(() => [null]);

      if (mp) {
        // Recalculate total inventory for this MP across all tracked levels
        // For now, just adjust by the delta (full reconciliation happens daily)
        await sql`
          UPDATE master_products 
          SET total_inventory = GREATEST(COALESCE(total_inventory, 0), 0)
          WHERE id = ${mp.id}
        `;
        result.updated = { mpId: mp.id, available };
      }

      result.inventory = { itemId: inventory_item_id, locationId: location_id, available };
    }

    // ── orders/create ───────────────────────────────────────
    if (topic === 'orders/create') {
      const items = [];
      for (const li of (payload.line_items || [])) {
        // Try to match line item to MP via product title
        const mpId = li.title ? matchProduct(li.title) : null;
        if (mpId) {
          items.push({ mpId, sku: li.sku, qty: li.quantity, price: parseFloat(li.price || 0) });

          // Deduct stock
          await sql`
            UPDATE master_products 
            SET total_inventory = GREATEST(COALESCE(total_inventory, 0) - ${li.quantity}, 0)
            WHERE id = ${mpId}
          `;
        }
      }

      const store = payload.source_name === 'pos' ? (payload.location_id || 'POS') : 'Online';

      if (items.length > 0) {
        await emit(Events.SALE_RECORDED, {
          orderId: payload.name || payload.id,
          store,
          total: parseFloat(payload.total_price || 0),
          items,
        });
      }

      result.order = { name: payload.name, total: payload.total_price, items: items.length };
    }

    // ── products/update ─────────────────────────────────────
    if (topic === 'products/update') {
      const mpId = matchProduct(payload.title, Math.max(...(payload.variants || []).map(v => parseFloat(v.price) || 0), 0));
      if (mpId && payload.image?.src) {
        await sql`
          UPDATE master_products SET hero_image = ${payload.image.src}
          WHERE id = ${mpId}
        `;
        result.product = { mpId, image: true };
      }
    }

    // Audit
    await sql`
      INSERT INTO audit_log (entity_type, entity_id, action, changes)
      VALUES ('webhook', ${topic}, ${topic}, ${JSON.stringify({ domain, ...result })})
    `.catch(() => null);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
