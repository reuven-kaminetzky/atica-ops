/**
 * lib/dal/orders.js — Orders Data Access Layer
 *
 * Table: orders (header) + sales (line items, renamed conceptually to order_lines)
 * Created by migration 012.
 *
 * Orders are the proper order-level entity. The existing `sales` table
 * holds line items. Each order has many sales rows linked via order_ref.
 *
 * Owner: Almond
 */

const { sql, audit } = require('./db');

const orders = {

  async getById(id) {
    const db = sql();
    const [order] = await db`SELECT * FROM orders WHERE id = ${id}`;
    if (!order) return null;

    const lines = await db`
      SELECT s.*, mp.name AS mp_name, st.colorway
      FROM sales s
      LEFT JOIN master_products mp ON mp.id = s.mp_id
      LEFT JOIN styles st ON st.id = s.style_id
      WHERE s.order_ref = ${id}
      ORDER BY s.id
    `;

    return { ...order, lines };
  },

  async getByShopifyId(shopifyOrderId) {
    const db = sql();
    const [order] = await db`SELECT * FROM orders WHERE shopify_order_id = ${shopifyOrderId}`;
    return order || null;
  },

  async getByCustomer(customerId, limit = 50) {
    const db = sql();
    return db`
      SELECT * FROM orders
      WHERE customer_id = ${customerId}
      ORDER BY ordered_at DESC
      LIMIT ${limit}
    `;
  },

  async getRecent(limit = 50) {
    const db = sql();
    return db`
      SELECT o.*, c.name AS customer_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ORDER BY o.ordered_at DESC
      LIMIT ${limit}
    `;
  },

  async getRevenueByDay(days = 30) {
    const db = sql();
    return db`
      SELECT ordered_at::date AS day,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COALESCE(SUM(item_count), 0)::int AS units,
        COALESCE(ROUND(AVG(total), 2), 0)::numeric AS aov
      FROM orders
      WHERE ordered_at >= NOW() - (${days} || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  },

  async getRevenueByChannel(days = 30) {
    const db = sql();
    return db`
      SELECT channel,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COALESCE(SUM(item_count), 0)::int AS units
      FROM orders
      WHERE ordered_at >= NOW() - (${days} || ' days')::interval
      GROUP BY channel
      ORDER BY revenue DESC
    `;
  },

  /**
   * create() — Insert order + line items in a transaction.
   * @netlify/neon supports transactions via db.begin().
   * If begin() fails (older neon version), falls back to sequential inserts.
   */
  async create({ order, lines }) {
    const db = sql();

    const orderId = order.id || `ORD-${Date.now().toString(36).toUpperCase()}`;

    try {
      // Try transaction
      await db.begin(async (tx) => {
        await tx`
          INSERT INTO orders (id, shopify_order_id, order_number, channel, location_code,
            customer_id, subtotal, tax, total, item_count, status, ordered_at)
          VALUES (${orderId}, ${order.shopifyOrderId || null}, ${order.orderNumber || null},
            ${order.channel || 'retail'}, ${order.locationCode || null},
            ${order.customerId || null}, ${order.subtotal || null}, ${order.tax || 0},
            ${order.total || 0}, ${lines.length}, ${order.status || 'completed'},
            ${order.orderedAt || new Date().toISOString()})
          ON CONFLICT (id) DO NOTHING
        `;

        for (const line of lines) {
          await tx`
            INSERT INTO sales (order_id, order_shopify_id, ordered_at, store, mp_id, style_id,
              sku, sku_id, title, quantity, unit_price, total, customer_name, source, channel, order_ref)
            VALUES (${order.orderNumber || orderId}, ${order.shopifyOrderId || null},
              ${order.orderedAt || new Date().toISOString()},
              ${order.locationCode || null}, ${line.mpId || null}, ${line.styleId || null},
              ${line.sku || null}, ${line.skuId || null}, ${line.title || null},
              ${line.quantity || 1}, ${line.unitPrice || 0}, ${line.total || 0},
              ${order.customerName || null}, ${order.source || 'shopify'},
              ${order.channel || 'retail'}, ${orderId})
            ON CONFLICT ON CONSTRAINT idx_sales_dedup DO NOTHING
          `;
        }
      });
    } catch (txError) {
      // Fallback: sequential inserts if begin() not supported
      if (txError.message?.includes('begin') || txError.message?.includes('transaction')) {
        await db`
          INSERT INTO orders (id, shopify_order_id, order_number, channel, location_code,
            customer_id, subtotal, tax, total, item_count, status, ordered_at)
          VALUES (${orderId}, ${order.shopifyOrderId || null}, ${order.orderNumber || null},
            ${order.channel || 'retail'}, ${order.locationCode || null},
            ${order.customerId || null}, ${order.subtotal || null}, ${order.tax || 0},
            ${order.total || 0}, ${lines.length}, ${order.status || 'completed'},
            ${order.orderedAt || new Date().toISOString()})
          ON CONFLICT (id) DO NOTHING
        `;

        for (const line of lines) {
          await db`
            INSERT INTO sales (order_id, order_shopify_id, ordered_at, store, mp_id, style_id,
              sku, sku_id, title, quantity, unit_price, total, customer_name, source, channel, order_ref)
            VALUES (${order.orderNumber || orderId}, ${order.shopifyOrderId || null},
              ${order.orderedAt || new Date().toISOString()},
              ${order.locationCode || null}, ${line.mpId || null}, ${line.styleId || null},
              ${line.sku || null}, ${line.skuId || null}, ${line.title || null},
              ${line.quantity || 1}, ${line.unitPrice || 0}, ${line.total || 0},
              ${order.customerName || null}, ${order.source || 'shopify'},
              ${order.channel || 'retail'}, ${orderId})
          `.catch(() => {}); // dedup constraint handles duplicates
        }
      } else {
        throw txError;
      }
    }

    audit('order', orderId, 'created', { lines: lines.length, total: order.total, channel: order.channel });
    return { id: orderId, lines: lines.length };
  },

  async count(days) {
    const db = sql();
    if (days) {
      const [r] = await db`SELECT COUNT(*)::int AS n FROM orders WHERE ordered_at >= NOW() - (${days} || ' days')::interval`;
      return r.n;
    }
    const [r] = await db`SELECT COUNT(*)::int AS n FROM orders`;
    return r.n;
  },

  async getSummary(days = 30) {
    const db = sql();
    const [r] = await db`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COALESCE(SUM(item_count), 0)::int AS units,
        COALESCE(ROUND(AVG(total), 2), 0)::numeric AS aov,
        COUNT(DISTINCT customer_id)::int AS unique_customers
      FROM orders
      WHERE ordered_at >= NOW() - (${days} || ' days')::interval
    `;
    return r;
  },
};

module.exports = orders;
