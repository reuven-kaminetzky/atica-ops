const { createClient } = require('../../lib/shopify');
const { json, cors, authenticate } = require('../../lib/auth');

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors() };
  }

  // Auth check
  const auth = authenticate(event);
  if (!auth.ok) return json(401, { error: auth.error });

  // Parse route: /api/shopify/{action}/{sub}
  const path = event.path.replace(/^\/api\/shopify\/?/, '').replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);
  const action = segments[0] || '';
  const sub = segments.slice(1).join('/');
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};
  const body = event.body ? JSON.parse(event.body) : {};

  // ── Status (no client needed) ─────────────────────────────
  if (action === 'status') {
    const client = createClient();
    if (!client) {
      return json(200, {
        connected: false,
        message: 'Shopify not configured — set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN',
      });
    }
    try {
      const { shop } = await client._request('/shop.json');
      return json(200, {
        connected: true,
        shop: shop.name,
        domain: shop.domain,
        plan: shop.plan_name,
        currency: shop.currency,
      });
    } catch (err) {
      return json(200, { connected: false, error: err.message });
    }
  }

  // ── Connect ───────────────────────────────────────────────
  if (action === 'connect' && method === 'POST') {
    // In production, store URL & token would be saved to env/database
    // For now, return instructions
    return json(200, {
      message: 'Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN as Netlify environment variables',
      steps: [
        'Go to Netlify dashboard → Site settings → Environment variables',
        'Add SHOPIFY_STORE_URL = your-store.myshopify.com',
        'Add SHOPIFY_ACCESS_TOKEN = shpat_xxxxx (from Shopify custom app)',
        'Redeploy the site',
      ],
    });
  }

  // All remaining routes need a configured client
  const client = createClient();
  if (!client) {
    return json(503, { error: 'Shopify not configured' });
  }

  try {
    // ── Sync Products ─────────────────────────────────────
    if (action === 'sync' && sub === 'products' && method === 'POST') {
      const data = await client.getProducts();
      const products = data.products.map(p => ({
        shopifyId: p.id,
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        productType: p.product_type,
        status: p.status,
        tags: p.tags,
        variants: p.variants.map(v => ({
          variantId: v.id,
          sku: v.sku,
          title: v.title,
          price: v.price,
          inventoryItemId: v.inventory_item_id,
          inventoryQty: v.inventory_quantity,
        })),
        images: p.images.map(i => ({ id: i.id, src: i.src })),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));
      return json(200, { count: products.length, products });
    }

    // ── Sync Orders ───────────────────────────────────────
    if (action === 'sync' && sub === 'orders' && method === 'POST') {
      const orderParams = {};
      if (body.since) orderParams.created_at_min = body.since;
      if (params.since) orderParams.created_at_min = params.since;
      const data = await client.getOrders(orderParams);
      const orders = data.orders.map(o => ({
        shopifyId: o.id,
        name: o.name,
        email: o.email,
        totalPrice: o.total_price,
        subtotalPrice: o.subtotal_price,
        totalTax: o.total_tax,
        totalDiscount: o.total_discounts,
        currency: o.currency,
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status,
        lineItems: o.line_items.map(li => ({
          sku: li.sku,
          title: li.title,
          variantTitle: li.variant_title,
          quantity: li.quantity,
          price: li.price,
          productId: li.product_id,
          variantId: li.variant_id,
        })),
        customer: o.customer ? {
          id: o.customer.id,
          email: o.customer.email,
          firstName: o.customer.first_name,
          lastName: o.customer.last_name,
          ordersCount: o.customer.orders_count,
          totalSpent: o.customer.total_spent,
        } : null,
        shippingAddress: o.shipping_address ? {
          city: o.shipping_address.city,
          province: o.shipping_address.province,
          country: o.shipping_address.country,
          zip: o.shipping_address.zip,
        } : null,
        createdAt: o.created_at,
        closedAt: o.closed_at,
      }));
      return json(200, { count: orders.length, orders });
    }

    // ── Sync Inventory ────────────────────────────────────
    if (action === 'sync' && sub === 'inventory' && method === 'POST') {
      const locData = await client.getLocations();
      const locations = locData.locations;
      const inventory = [];
      for (const loc of locations) {
        const levels = await client.getInventoryLevels(loc.id);
        inventory.push({
          locationId: loc.id,
          locationName: loc.name,
          levels: levels.inventory_levels.map(l => ({
            inventoryItemId: l.inventory_item_id,
            available: l.available,
            updatedAt: l.updated_at,
          })),
        });
      }
      return json(200, { locations: inventory });
    }

    // ── Velocity (sales per day by SKU) ───────────────────
    if (action === 'velocity') {
      const days = parseInt(params.days || '30', 10);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const data = await client.getOrders({ created_at_min: since });
      const skuVelocity = {};
      for (const order of data.orders) {
        for (const li of order.line_items) {
          const sku = li.sku || `variant-${li.variant_id}`;
          if (!skuVelocity[sku]) skuVelocity[sku] = { sku, title: li.title, units: 0, revenue: 0 };
          skuVelocity[sku].units += li.quantity;
          skuVelocity[sku].revenue += parseFloat(li.price) * li.quantity;
        }
      }
      const velocity = Object.values(skuVelocity)
        .map(v => ({ ...v, unitsPerDay: +(v.units / days).toFixed(2) }))
        .sort((a, b) => b.units - a.units);
      return json(200, { days, orderCount: data.orders.length, velocity });
    }

    // ── Sales Summary ─────────────────────────────────────
    if (action === 'sales') {
      const days = parseInt(params.days || '30', 10);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const data = await client.getOrders({ created_at_min: since });
      let totalRevenue = 0, totalOrders = 0, totalUnits = 0;
      const dailySales = {};
      for (const order of data.orders) {
        totalOrders++;
        totalRevenue += parseFloat(order.total_price);
        const day = order.created_at.slice(0, 10);
        if (!dailySales[day]) dailySales[day] = { date: day, revenue: 0, orders: 0, units: 0 };
        dailySales[day].revenue += parseFloat(order.total_price);
        dailySales[day].orders++;
        for (const li of order.line_items) {
          totalUnits += li.quantity;
          dailySales[day].units += li.quantity;
        }
      }
      return json(200, {
        days,
        totalRevenue: +totalRevenue.toFixed(2),
        totalOrders,
        totalUnits,
        avgOrderValue: totalOrders ? +(totalRevenue / totalOrders).toFixed(2) : 0,
        dailySales: Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date)),
      });
    }

    // ── Ledger (order-level detail) ───────────────────────
    if (action === 'ledger') {
      const days = parseInt(params.days || '30', 10);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const data = await client.getOrders({ created_at_min: since });
      const ledger = data.orders.map(o => ({
        date: o.created_at.slice(0, 10),
        orderId: o.id,
        orderName: o.name,
        customer: o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Guest',
        subtotal: o.subtotal_price,
        tax: o.total_tax,
        discount: o.total_discounts,
        total: o.total_price,
        items: o.line_items.length,
        status: o.financial_status,
      }));
      return json(200, { days, entries: ledger.length, ledger });
    }

    // ── Snapshots (inventory snapshot) ────────────────────
    if (action === 'snapshot' && method === 'POST') {
      const products = await client.getProducts();
      const snapshot = {
        timestamp: new Date().toISOString(),
        products: products.products.map(p => ({
          id: p.id,
          title: p.title,
          totalInventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
          variants: p.variants.map(v => ({
            sku: v.sku,
            title: v.title,
            inventory: v.inventory_quantity,
            price: v.price,
          })),
        })),
      };
      return json(200, snapshot);
    }

    // ── SKU Map ───────────────────────────────────────────
    if (action === 'sku-map' && !sub) {
      const products = await client.getProducts();
      const skuMap = [];
      for (const p of products.products) {
        for (const v of p.variants) {
          skuMap.push({
            shopifyProductId: p.id,
            shopifyVariantId: v.id,
            sku: v.sku || '',
            productTitle: p.title,
            variantTitle: v.title,
            price: v.price,
            inventoryItemId: v.inventory_item_id,
          });
        }
      }
      return json(200, { count: skuMap.length, skuMap });
    }

    // ── Webhooks Setup ────────────────────────────────────
    if (action === 'webhooks' && sub === 'setup' && method === 'POST') {
      const baseUrl = body.base_url;
      if (!baseUrl) return json(400, { error: 'base_url required' });

      const topics = [
        'orders/create',
        'orders/updated',
        'products/update',
        'inventory_levels/update',
      ];

      // Remove existing webhooks
      const existing = await client.getWebhooks();
      for (const wh of existing.webhooks) {
        await client.deleteWebhook(wh.id);
      }

      // Create new ones
      const created = [];
      for (const topic of topics) {
        const address = `${baseUrl}/api/webhooks/shopify`;
        const result = await client.createWebhook(topic, address);
        created.push({ topic, address, id: result.webhook.id });
      }

      return json(200, { message: 'Webhooks configured', webhooks: created });
    }

    // ── Disconnect ────────────────────────────────────────
    if (action === 'disconnect' && method === 'POST') {
      return json(200, {
        message: 'Remove SHOPIFY_ACCESS_TOKEN from Netlify environment variables to disconnect',
      });
    }

    return json(404, { error: `Unknown shopify route: ${action}/${sub}` });

  } catch (err) {
    console.error('Shopify function error:', err);
    return json(500, { error: err.message });
  }
};
