/**
 * lib/dal/skus.js — SKU Data Access Layer
 * 
 * SKU = the lowest level of the product hierarchy:
 * Type → MP → Style → SKU (fit + size + length)
 * 
 * Each SKU maps to one Shopify variant.
 * 
 * Owner: Almond
 */

const { sql } = require('./db');

const skus = {

  async getByStyle(styleId) {
    const db = sql();
    return db`SELECT * FROM skus WHERE style_id = ${styleId} AND is_active = true ORDER BY fit, size, length`;
  },

  async getByMP(mpId) {
    const db = sql();
    return db`SELECT s.*, st.title AS style_title, st.colorway 
      FROM skus s JOIN styles st ON st.id = s.style_id 
      WHERE s.mp_id = ${mpId} AND s.is_active = true 
      ORDER BY st.colorway, s.fit, s.size, s.length`;
  },

  async getByVariantId(shopifyVariantId) {
    const db = sql();
    const [row] = await db`SELECT * FROM skus WHERE shopify_variant_id = ${shopifyVariantId}`;
    return row || null;
  },

  async upsert(data) {
    const db = sql();
    const [row] = await db`
      INSERT INTO skus (style_id, mp_id, fit, size, length, sku_code, barcode, shopify_variant_id, shopify_inventory_item_id)
      VALUES (${data.styleId}, ${data.mpId}, ${data.fit || null}, ${data.size}, ${data.length || null},
        ${data.skuCode || null}, ${data.barcode || null}, ${data.shopifyVariantId || null}, ${data.shopifyInventoryItemId || null})
      ON CONFLICT (shopify_variant_id) DO UPDATE SET
        fit = EXCLUDED.fit, size = EXCLUDED.size, length = EXCLUDED.length,
        sku_code = EXCLUDED.sku_code, is_active = true
      RETURNING *
    `;
    return row;
  },

  async count() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS count FROM skus WHERE is_active = true`;
    return r.count;
  },

  async countByMP(mpId) {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS count FROM skus WHERE mp_id = ${mpId} AND is_active = true`;
    return r.count;
  },

  async getFitSizeMatrix(mpId) {
    const db = sql();
    return db`
      SELECT s.fit, s.size, s.length, COUNT(*)::int AS variant_count,
        st.colorway, st.title AS style_title
      FROM skus s
      JOIN styles st ON st.id = s.style_id
      WHERE s.mp_id = ${mpId} AND s.is_active = true
      GROUP BY s.fit, s.size, s.length, st.colorway, st.title
      ORDER BY s.fit, s.size, s.length
    `;
  },
};

module.exports = skus;
