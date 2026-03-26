/**
 * lib/db.js — Database Layer (Netlify DB / Neon Postgres)
 * 
 * Uses @netlify/neon which auto-connects — no connection string needed.
 * Falls back gracefully if database isn't provisioned.
 * 
 * Usage:
 *   const { sql, isAvailable } = require('./db');
 *   const rows = await sql`SELECT * FROM purchase_orders WHERE vendor = ${'TAL'}`;
 */

const { neon } = require('@netlify/neon');

let _sql = null;
let _available = null;

function getSql() {
  if (_sql) return _sql;
  _sql = neon(); // auto-connects on Netlify
  return _sql;
}

async function isAvailable() {
  if (_available !== null) return _available;
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    _available = true;
    return true;
  } catch (e) {
    console.warn('[db] Postgres not available:', e.message);
    _available = false;
    return false;
  }
}

// ── Schema Migration ──────────────────────────────────────

async function migrate() {
  const sql = getSql();
  const fs = require('fs');
  const path = require('path');
  
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error('Migration file not found');
  }

  const migration = fs.readFileSync(migrationPath, 'utf8');
  const statements = migration.split(';').map(s => s.trim()).filter(s => s.length > 10 && !s.startsWith('--'));

  let executed = 0;
  const errors = [];

  for (const stmt of statements) {
    try {
      await sql(stmt);
      executed++;
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        executed++;
      } else {
        errors.push({ sql: stmt.slice(0, 80), error: msg.slice(0, 120) });
      }
    }
  }

  const tables = await sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' ORDER BY table_name
  `;

  return { migrated: true, executed, total: statements.length, errors: errors.slice(0, 10), tables: tables.map(t => t.table_name) };
}

// ── PO Operations ─────────────────────────────────────────

function rowToPO(row) {
  return {
    id: row.id, mpId: row.mp_id, mpName: row.mp_name, mpCode: row.mp_code,
    cat: row.cat, vendor: row.vendor, fob: parseFloat(row.fob) || 0,
    units: row.units || 0, fobTotal: parseFloat(row.fob_total) || 0,
    landedCost: row.landed_cost ? parseFloat(row.landed_cost) : null,
    moq: row.moq || 0, lead: row.lead || 0, hts: row.hts,
    duty: parseFloat(row.duty) || 0, stage: row.stage, stageIndex: row.stage_index,
    etd: row.etd, eta: row.eta, container: row.container, vessel: row.vessel,
    notes: row.notes || '', tags: row.tags || [], styles: row.styles || [],
    sizes: row.sizes, fits: row.fits || [],
    checkIns: row.check_ins || { pd: [], fin: [] },
    payments: [], history: row.history || [],
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const po = {
  async get(id) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM purchase_orders WHERE id = ${id}`;
    return rows[0] ? rowToPO(rows[0]) : null;
  },

  async put(id, data) {
    const sql = getSql();
    const now = new Date().toISOString();
    await sql`
      INSERT INTO purchase_orders (id, mp_id, mp_name, mp_code, cat, vendor, fob, units,
        fob_total, landed_cost, moq, lead, hts, duty, stage, stage_index,
        etd, eta, container, vessel, notes, tags, styles, sizes, fits,
        check_ins, history, created_at, updated_at)
      VALUES (${id}, ${data.mpId}, ${data.mpName}, ${data.mpCode}, ${data.cat},
        ${data.vendor}, ${data.fob || 0}, ${data.units || 0},
        ${data.fobTotal || 0}, ${data.landedCost}, ${data.moq || 0}, ${data.lead || 0},
        ${data.hts}, ${data.duty || 0}, ${data.stage || 'Concept'}, ${data.stageIndex || 1},
        ${data.etd}, ${data.eta}, ${data.container}, ${data.vessel},
        ${data.notes || ''}, ${data.tags || []}, ${JSON.stringify(data.styles || [])},
        ${data.sizes}, ${JSON.stringify(data.fits || [])},
        ${JSON.stringify(data.checkIns || {pd:[],fin:[]})},
        ${JSON.stringify(data.history || [])},
        ${data.createdAt || now}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        mp_id = EXCLUDED.mp_id, mp_name = EXCLUDED.mp_name, vendor = EXCLUDED.vendor,
        fob = EXCLUDED.fob, units = EXCLUDED.units, fob_total = EXCLUDED.fob_total,
        landed_cost = EXCLUDED.landed_cost, stage = EXCLUDED.stage, stage_index = EXCLUDED.stage_index,
        etd = EXCLUDED.etd, eta = EXCLUDED.eta, container = EXCLUDED.container,
        vessel = EXCLUDED.vessel, notes = EXCLUDED.notes, check_ins = EXCLUDED.check_ins,
        history = EXCLUDED.history, updated_at = NOW()
    `;
    return data;
  },

  async delete(id) {
    const sql = getSql();
    await sql`DELETE FROM purchase_orders WHERE id = ${id}`;
    return { deleted: true, key: id };
  },

  async getAll() {
    const sql = getSql();
    const rows = await sql`SELECT * FROM purchase_orders ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async findByVendor(vendor) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM purchase_orders WHERE vendor = ${vendor} ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async findByMP(mpId) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM purchase_orders WHERE mp_id = ${mpId} ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async findActive() {
    const sql = getSql();
    const rows = await sql`SELECT * FROM purchase_orders WHERE stage NOT IN ('received', 'distribution') ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async countByStage() {
    const sql = getSql();
    const rows = await sql`SELECT stage, COUNT(*)::int as count FROM purchase_orders GROUP BY stage`;
    const result = {};
    for (const r of rows) result[r.stage] = r.count;
    return result;
  },
};

module.exports = { getSql, isAvailable, migrate, po };
