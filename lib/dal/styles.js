/**
 * lib/dal/styles.js — Data Access for styles table
 *
 * Each style = one Shopify product = one colorway under an MP.
 */

const { sql } = require('./db');

module.exports = {
  async getByMP(mpId) {
    const db = sql();
    return db`SELECT * FROM styles WHERE mp_id = ${mpId} AND status = 'active' ORDER BY inventory DESC`;
  },

  async getById(id) {
    const db = sql();
    const [style] = await db`SELECT * FROM styles WHERE id = ${id}`;
    return style || null;
  },

  async upsert({ id, mpId, externalProductId, title, colorway, heroImage, retail, inventory, variantCount, handle, tags, status }) {
    const db = sql();
    const [style] = await db`
      INSERT INTO styles (id, mp_id, external_product_id, title, colorway, hero_image, retail, inventory, variant_count, external_handle, tags, status)
      VALUES (${id}, ${mpId}, ${externalProductId}, ${title}, ${colorway}, ${heroImage},
        ${retail || 0}, ${inventory || 0}, ${variantCount || 0}, ${handle}, ${tags || []},
        ${status || 'active'})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, colorway = EXCLUDED.colorway, hero_image = EXCLUDED.hero_image,
        retail = EXCLUDED.retail, inventory = EXCLUDED.inventory, variant_count = EXCLUDED.variant_count,
        tags = EXCLUDED.tags, status = EXCLUDED.status, updated_at = NOW()
      RETURNING *
    `;
    return style;
  },

  async updateGrade(id, grade) {
    const db = sql();
    const [updated] = await db`UPDATE styles SET grade = ${grade}, updated_at = NOW() WHERE id = ${id} RETURNING *`;
    return updated;
  },

  async updateInventory(id, inventory) {
    const db = sql();
    await db`UPDATE styles SET inventory = ${inventory}, updated_at = NOW() WHERE id = ${id}`;
  },

  async countByMP(mpId) {
    const db = sql();
    const [row] = await db`SELECT COUNT(*)::int AS n, SUM(inventory)::int AS total_inv FROM styles WHERE mp_id = ${mpId} AND status = 'active'`;
    return { count: row.n, totalInventory: row.total_inv || 0 };
  },

  async deductStock(externalProductId, qty) {
    const db = sql();
    await db`UPDATE styles SET inventory = GREATEST(inventory - ${qty}, 0), updated_at = NOW() WHERE external_product_id = ${externalProductId}`;
  },
};
