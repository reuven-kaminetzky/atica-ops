/**
 * lib/dal/products.js — Product Data Access Layer
 * 
 * All product-related database operations.
 * No business logic here — just data in, data out.
 */

const { sql } = require('./db');

const products = {
  async getAll() {
    const db = sql();
    return db`
      SELECT mp.*, 
        ps.completeness, ps.fabric_type,
        COALESCE(po_agg.active_pos, 0)::int AS active_pos,
        COALESCE(po_agg.committed_cost, 0)::numeric AS committed_cost,
        COALESCE(style_agg.style_count, 0)::int AS style_count,
        COALESCE(style_agg.style_inventory, 0)::int AS style_inventory
      FROM master_products mp
      LEFT JOIN product_stack ps ON ps.mp_id = mp.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS active_pos, SUM(fob_total) AS committed_cost
        FROM purchase_orders WHERE mp_id = mp.id AND stage NOT IN ('received', 'distribution')
      ) po_agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS style_count, SUM(inventory) AS style_inventory
        FROM styles WHERE mp_id = mp.id AND status = 'active'
      ) style_agg ON TRUE
      ORDER BY mp.category, mp.name
    `.catch(async () => {
      // Fallback if styles table doesn't exist yet
      return db`
        SELECT mp.*, 
          ps.completeness, ps.fabric_type,
          COALESCE(po_agg.active_pos, 0)::int AS active_pos,
          COALESCE(po_agg.committed_cost, 0)::numeric AS committed_cost,
          0::int AS style_count, 0::int AS style_inventory
        FROM master_products mp
        LEFT JOIN product_stack ps ON ps.mp_id = mp.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS active_pos, SUM(fob_total) AS committed_cost
          FROM purchase_orders WHERE mp_id = mp.id AND stage NOT IN ('received', 'distribution')
        ) po_agg ON TRUE
        ORDER BY mp.category, mp.name
      `;
    });
  },

  async getById(id) {
    const db = sql();
    const [mp] = await db`SELECT * FROM master_products WHERE id = ${id}`;
    if (!mp) return null;

    const [stack, pos, history, styles] = await Promise.all([
      db`SELECT * FROM product_stack WHERE mp_id = ${id}`,
      db`SELECT * FROM purchase_orders WHERE mp_id = ${id} ORDER BY created_at DESC`,
      db`SELECT * FROM plm_history WHERE mp_id = ${id} ORDER BY changed_at DESC LIMIT 20`,
      db`SELECT * FROM styles WHERE mp_id = ${id} AND status = 'active' ORDER BY inventory DESC`.catch(() => []),
    ]);

    return { ...mp, stack: stack[0] || null, purchaseOrders: pos, plmHistory: history, styles };
  },

  async updatePhase(id, phase, changedBy = null) {
    const db = sql();
    const [updated] = await db`
      UPDATE master_products SET phase = ${phase}, phase_changed_at = NOW(), phase_changed_by = ${changedBy}
      WHERE id = ${id} RETURNING *
    `;
    return updated;
  },

  async updateInventory(id, { totalInventory, daysOfStock, velocityPerWeek, signal }) {
    const db = sql();
    const [updated] = await db`
      UPDATE master_products SET 
        total_inventory = ${totalInventory},
        days_of_stock = ${daysOfStock},
        velocity_per_week = ${velocityPerWeek},
        signal = ${signal}
      WHERE id = ${id} RETURNING *
    `;
    return updated;
  },

  async updateStack(id, fields) {
    const db = sql();
    // Only update fields that are explicitly provided
    const allowed = [
      'fabric_type', 'fabric_weight', 'fabric_comp', 'fabric_mill', 'colorways', 'wash_care',
      'seams', 'stitching', 'buttons', 'zippers', 'lining', 'interlining', 'labels', 'packaging',
      'size_chart', 'grading', 'fit_notes', 'tolerances', 'measurement_points',
      'aql_level', 'qc_checklist',
      'packing_instructions', 'label_requirements', 'shipping_marks', 'carton_specs',
      'country_of_origin', 'care_labels', 'hang_tags',
      'description', 'tagline', 'additional_images',
    ];

    const updates = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) updates[key] = fields[key];
    }

    if (Object.keys(updates).length === 0) return { changed: false };

    // Compute completeness
    const [existing] = await db`SELECT * FROM product_stack WHERE mp_id = ${id}`;
    const merged = { ...(existing || {}), ...updates };
    let filled = 0;
    for (const key of allowed) {
      const val = merged[key];
      if (val && val !== '' && !(Array.isArray(val) && val.length === 0)) filled++;
    }
    const completeness = Math.round((filled / allowed.length) * 100);

    // Upsert
    await db`
      INSERT INTO product_stack (mp_id, completeness) VALUES (${id}, ${completeness})
      ON CONFLICT (mp_id) DO UPDATE SET completeness = ${completeness}
    `;

    // Update individual fields (dynamic SQL via Pool for safety)
    const { Pool } = require('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.NETLIFY_DATABASE_URL });
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
    const values = [id, ...Object.values(updates)];
    await pool.query(
      `UPDATE product_stack SET ${setClauses.join(', ')}, completeness = ${completeness} WHERE mp_id = $1`,
      values
    );
    await pool.end();

    return { changed: true, completeness, fieldsUpdated: Object.keys(updates).length };
  },

  async count() {
    const db = sql();
    const [r] = await db`SELECT COUNT(*)::int AS n FROM master_products`;
    return r.n;
  },

  // ── Event handler support ───────────────────────────────
  async addInventory(id, qty) {
    const db = sql();
    await db`UPDATE master_products SET total_inventory = COALESCE(total_inventory, 0) + ${qty} WHERE id = ${id}`;
  },

  async deductInventory(id, qty) {
    const db = sql();
    await db`UPDATE master_products SET total_inventory = GREATEST(COALESCE(total_inventory, 0) - ${qty}, 0) WHERE id = ${id}`;
  },

  async getInventoryData(id) {
    const db = sql();
    const [mp] = await db`SELECT total_inventory, velocity_per_week, days_of_stock, signal FROM master_products WHERE id = ${id}`;
    return mp || null;
  },

  async updateSignal(id, signal, daysOfStock) {
    const db = sql();
    await db`UPDATE master_products SET signal = ${signal}, days_of_stock = ${daysOfStock} WHERE id = ${id}`;
  },

  async updateShopifyData(id, shopifyIds, heroImage) {
    const db = sql();
    await db`UPDATE master_products SET external_ids = ${shopifyIds}, hero_image = ${heroImage} WHERE id = ${id}`;
  },

  async updateVelocity(id, { velocity, sellThrough, daysOfStock, signal }) {
    const db = sql();
    await db`UPDATE master_products SET velocity_per_week = ${velocity}, sell_through = ${sellThrough}, days_of_stock = ${daysOfStock}, signal = ${signal} WHERE id = ${id}`;
  },

  async updateTotalInventory(id, stock) {
    const db = sql();
    await db`UPDATE master_products SET total_inventory = ${stock} WHERE id = ${id}`;
  },

  // ── Style Methods ──

  async upsertStyle(data) {
    const db = sql();
    const [style] = await db`
      INSERT INTO styles (id, mp_id, external_product_id, title, colorway, hero_image, retail, inventory, variant_count, external_handle, tags, status)
      VALUES (${data.id}, ${data.mpId}, ${data.externalProductId}, ${data.title}, ${data.colorway || null}, ${data.heroImage || null},
        ${data.retail || 0}, ${data.inventory || 0}, ${data.variantCount || 0}, ${data.handle || null}, ${data.tags || []},
        ${data.status || 'active'})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, colorway = EXCLUDED.colorway, hero_image = EXCLUDED.hero_image,
        retail = EXCLUDED.retail, inventory = EXCLUDED.inventory, variant_count = EXCLUDED.variant_count,
        tags = EXCLUDED.tags, status = EXCLUDED.status, updated_at = NOW()
      RETURNING *
    `;
    return style;
  },

  async getStylesByMp(mpId) {
    const db = sql();
    return db`SELECT * FROM styles WHERE mp_id = ${mpId} AND status = 'active' ORDER BY inventory DESC`;
  },
};

module.exports = products;
