/**
 * lib/dal/inventory.js — Event-Sourced Inventory
 * 
 * Every inventory change is an event. Current stock = SUM(events).
 * Materialized view (inventory_levels) provides fast reads.
 * 
 * Event types:
 *   initial_seed  — baseline from Shopify
 *   sale          — negative qty from order
 *   po_receipt    — positive qty from PO receiving
 *   transfer_out  — negative qty at source location
 *   transfer_in   — positive qty at destination
 *   adjustment    — manual correction
 *   return        — positive qty from customer return
 *   reconciliation — sync-driven correction
 * 
 * Owner: Almond
 */

const { sql } = require('./db');

const inventory = {

  async addEvent({ skuId, locationCode, eventType, quantity, referenceType, referenceId, notes, createdBy }) {
    const db = sql();
    const [row] = await db`
      INSERT INTO inventory_events (sku_id, location_code, event_type, quantity, reference_type, reference_id, notes, created_by)
      VALUES (${skuId}, ${locationCode}, ${eventType}, ${quantity}, ${referenceType || null}, ${referenceId || null}, ${notes || null}, ${createdBy || 'system'})
      RETURNING *
    `;
    return row;
  },

  async getStock(skuId, locationCode) {
    const db = sql();
    const [row] = await db`
      SELECT COALESCE(SUM(quantity), 0)::int AS on_hand
      FROM inventory_events
      WHERE sku_id = ${skuId} AND location_code = ${locationCode}
    `;
    return row.on_hand;
  },

  async getStockAllLocations(skuId) {
    const db = sql();
    return db`
      SELECT location_code, SUM(quantity)::int AS on_hand
      FROM inventory_events
      WHERE sku_id = ${skuId}
      GROUP BY location_code
      HAVING SUM(quantity) != 0
      ORDER BY location_code
    `;
  },

  async getStockByMP(mpId) {
    const db = sql();
    return db`
      SELECT ie.location_code, s.fit, s.size, s.length, st.colorway,
        SUM(ie.quantity)::int AS on_hand
      FROM inventory_events ie
      JOIN skus s ON s.id = ie.sku_id
      JOIN styles st ON st.id = s.style_id
      WHERE s.mp_id = ${mpId}
      GROUP BY ie.location_code, s.fit, s.size, s.length, st.colorway
      HAVING SUM(ie.quantity) != 0
      ORDER BY ie.location_code, st.colorway, s.fit, s.size
    `;
  },

  async getStockByLocation(locationCode) {
    const db = sql();
    return db`
      SELECT s.mp_id, mp.name AS mp_name, mp.category,
        st.colorway, s.fit, s.size, s.length,
        SUM(ie.quantity)::int AS on_hand
      FROM inventory_events ie
      JOIN skus s ON s.id = ie.sku_id
      JOIN styles st ON st.id = s.style_id
      JOIN master_products mp ON mp.id = s.mp_id
      WHERE ie.location_code = ${locationCode}
      GROUP BY s.mp_id, mp.name, mp.category, st.colorway, s.fit, s.size, s.length
      HAVING SUM(ie.quantity) != 0
      ORDER BY mp.category, mp.name, st.colorway, s.fit, s.size
    `;
  },

  async refreshMaterializedView() {
    const db = sql();
    await db`REFRESH MATERIALIZED VIEW CONCURRENTLY inventory_levels`;
  },

  async getRecentEvents(limit = 50) {
    const db = sql();
    return db`
      SELECT ie.*, s.fit, s.size, s.length, st.colorway, mp.name AS mp_name
      FROM inventory_events ie
      JOIN skus s ON s.id = ie.sku_id
      JOIN styles st ON st.id = s.style_id
      LEFT JOIN master_products mp ON mp.id = s.mp_id
      ORDER BY ie.created_at DESC
      LIMIT ${limit}
    `;
  },
};

module.exports = inventory;
