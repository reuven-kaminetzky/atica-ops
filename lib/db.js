/**
 * lib/db.js — Database Layer (Netlify DB / Neon Postgres)
 * 
 * Replaces Netlify Blobs for structured data.
 * Falls back to Blobs if DATABASE_URL is not configured.
 * 
 * Tables:
 *   purchase_orders  — PO CRUD with indexed mpId, vendor, stage
 *   po_payments      — payment schedule per PO
 *   shipments        — auto-created from PO side effects
 *   plm_stages       — MP lifecycle tracking
 *   product_stack    — tech pack data per MP
 *   audit_log        — change history for all entities
 * 
 * Usage:
 *   const db = require('./db');
 *   const po = await db.po.get('PO-2603-ABCD');
 *   const vendorPOs = await db.po.findByVendor('TAL');
 *   await db.po.put('PO-2603-ABCD', { ... });
 */

let _neon = null;
let _isAvailable = null;

function getNeon() {
  if (_neon) return _neon;
  try {
    _neon = require('@netlify/neon');
    return _neon;
  } catch (e) {
    return null;
  }
}

function getDbUrl() {
  return process.env.DATABASE_URL
    || process.env.NETLIFY_DATABASE_URL
    || process.env.NEON_DATABASE_URL
    || null;
}

async function isAvailable() {
  if (_isAvailable !== null) return _isAvailable;
  const neon = getNeon();
  const url = getDbUrl();
  if (!neon || !url) { _isAvailable = false; return false; }
  try {
    const sql = neon.neon(url);
    await sql`SELECT 1`;
    _isAvailable = true;
    return true;
  } catch (e) {
    console.warn('[db] Postgres not available, falling back to Blobs:', e.message);
    _isAvailable = false;
    return false;
  }
}

function getSql() {
  const neon = getNeon();
  const url = getDbUrl();
  if (!neon || !url) return null;
  return neon.neon(url);
}

// ── Schema Migration ──────────────────────────────────────

async function migrate() {
  const sql = getSql();
  if (!sql) throw new Error('DATABASE_URL not configured');

  await sql`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      mp_id TEXT,
      mp_name TEXT,
      mp_code TEXT,
      cat TEXT,
      vendor TEXT,
      fob NUMERIC(10,2) DEFAULT 0,
      units INTEGER DEFAULT 0,
      fob_total NUMERIC(12,2) DEFAULT 0,
      landed_cost NUMERIC(10,2),
      moq INTEGER DEFAULT 0,
      lead INTEGER DEFAULT 0,
      hts TEXT,
      duty NUMERIC(6,2) DEFAULT 0,
      stage TEXT DEFAULT 'Concept',
      stage_index INTEGER DEFAULT 1,
      etd DATE,
      eta DATE,
      container TEXT,
      vessel TEXT,
      notes TEXT DEFAULT '',
      tags TEXT[] DEFAULT '{}',
      styles JSONB DEFAULT '[]',
      sizes TEXT,
      fits JSONB DEFAULT '[]',
      check_ins JSONB DEFAULT '{"pd":[],"fin":[]}',
      history JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_po_mp_id ON purchase_orders(mp_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_po_stage ON purchase_orders(stage)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_po_created ON purchase_orders(created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS po_payments (
      id TEXT PRIMARY KEY,
      po_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      label TEXT,
      pct NUMERIC(5,2),
      amount NUMERIC(12,2) DEFAULT 0,
      due_date DATE,
      status TEXT DEFAULT 'planned',
      paid_date DATE,
      paid_amount NUMERIC(12,2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_payment_po ON po_payments(po_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payment_status ON po_payments(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payment_due ON po_payments(due_date)`;

  await sql`
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      po_num TEXT,
      product TEXT,
      container TEXT,
      vessel TEXT,
      origin TEXT,
      status TEXT DEFAULT 'pending',
      etd DATE,
      eta DATE,
      arrived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_shipment_po ON shipments(po_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS plm_stages (
      mp_id TEXT PRIMARY KEY,
      plm_stage TEXT DEFAULT 'Concept',
      plm_stage_id INTEGER DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by TEXT,
      history JSONB DEFAULT '[]'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS product_stack (
      mp_id TEXT PRIMARY KEY,
      fabric_type TEXT DEFAULT '',
      fabric_weight TEXT DEFAULT '',
      fabric_comp TEXT DEFAULT '',
      fabric_mill TEXT DEFAULT '',
      colorways JSONB DEFAULT '[]',
      wash_care TEXT DEFAULT '',
      seams TEXT DEFAULT '',
      stitching TEXT DEFAULT '',
      buttons TEXT DEFAULT '',
      zippers TEXT DEFAULT '',
      lining TEXT DEFAULT '',
      interlining TEXT DEFAULT '',
      labels TEXT DEFAULT '',
      packaging TEXT DEFAULT '',
      size_chart JSONB,
      grading JSONB,
      fit_notes TEXT DEFAULT '',
      tolerances TEXT DEFAULT '',
      measurement_points JSONB DEFAULT '[]',
      aql_level TEXT DEFAULT '2.5',
      qc_checklist JSONB DEFAULT '[]',
      test_reports JSONB DEFAULT '[]',
      approved_samples JSONB DEFAULT '[]',
      packing_instructions TEXT DEFAULT '',
      label_requirements TEXT DEFAULT '',
      shipping_marks TEXT DEFAULT '',
      carton_specs TEXT DEFAULT '',
      country_of_origin TEXT DEFAULT '',
      care_labels TEXT DEFAULT '',
      hang_tags TEXT DEFAULT '',
      description TEXT DEFAULT '',
      tagline TEXT DEFAULT '',
      features JSONB DEFAULT '[]',
      hero_image TEXT,
      additional_images JSONB DEFAULT '[]',
      history JSONB DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      changes JSONB,
      performed_by TEXT,
      performed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(performed_at DESC)`;

  return { migrated: true, tables: ['purchase_orders', 'po_payments', 'shipments', 'plm_stages', 'product_stack', 'audit_log'] };
}

// ── PO Operations ─────────────────────────────────────────

const po = {
  async get(id) {
    const sql = getSql();
    if (!sql) return null;
    const rows = await sql`SELECT * FROM purchase_orders WHERE id = ${id}`;
    return rows[0] ? rowToPO(rows[0]) : null;
  },

  async put(id, data) {
    const sql = getSql();
    if (!sql) return null;
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
        mp_id = EXCLUDED.mp_id, mp_name = EXCLUDED.mp_name, mp_code = EXCLUDED.mp_code,
        cat = EXCLUDED.cat, vendor = EXCLUDED.vendor, fob = EXCLUDED.fob, units = EXCLUDED.units,
        fob_total = EXCLUDED.fob_total, landed_cost = EXCLUDED.landed_cost,
        moq = EXCLUDED.moq, lead = EXCLUDED.lead, hts = EXCLUDED.hts, duty = EXCLUDED.duty,
        stage = EXCLUDED.stage, stage_index = EXCLUDED.stage_index,
        etd = EXCLUDED.etd, eta = EXCLUDED.eta, container = EXCLUDED.container,
        vessel = EXCLUDED.vessel, notes = EXCLUDED.notes, tags = EXCLUDED.tags,
        styles = EXCLUDED.styles, sizes = EXCLUDED.sizes, fits = EXCLUDED.fits,
        check_ins = EXCLUDED.check_ins, history = EXCLUDED.history,
        updated_at = NOW()
    `;
    return data;
  },

  async delete(id) {
    const sql = getSql();
    if (!sql) return { deleted: false };
    await sql`DELETE FROM purchase_orders WHERE id = ${id}`;
    return { deleted: true, key: id };
  },

  async getAll() {
    const sql = getSql();
    if (!sql) return [];
    const rows = await sql`SELECT * FROM purchase_orders ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  // ── NEW: Queryable operations (impossible with Blobs) ──

  async findByVendor(vendor) {
    const sql = getSql();
    if (!sql) return [];
    const rows = await sql`SELECT * FROM purchase_orders WHERE vendor = ${vendor} ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async findByMP(mpId) {
    const sql = getSql();
    if (!sql) return [];
    const rows = await sql`SELECT * FROM purchase_orders WHERE mp_id = ${mpId} ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async findByStage(stage) {
    const sql = getSql();
    if (!sql) return [];
    const rows = await sql`SELECT * FROM purchase_orders WHERE stage = ${stage} ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async findActive() {
    const sql = getSql();
    if (!sql) return [];
    const rows = await sql`SELECT * FROM purchase_orders WHERE stage NOT IN ('Received', 'Distribution') ORDER BY created_at DESC`;
    return rows.map(rowToPO);
  },

  async countByStage() {
    const sql = getSql();
    if (!sql) return {};
    const rows = await sql`SELECT stage, COUNT(*) as count FROM purchase_orders GROUP BY stage`;
    const result = {};
    for (const r of rows) result[r.stage] = parseInt(r.count);
    return result;
  },
};

// Row → JS object mapper (snake_case → camelCase)
function rowToPO(row) {
  return {
    id: row.id,
    mpId: row.mp_id,
    mpName: row.mp_name,
    mpCode: row.mp_code,
    cat: row.cat,
    vendor: row.vendor,
    fob: parseFloat(row.fob) || 0,
    units: row.units || 0,
    fobTotal: parseFloat(row.fob_total) || 0,
    landedCost: row.landed_cost ? parseFloat(row.landed_cost) : null,
    moq: row.moq || 0,
    lead: row.lead || 0,
    hts: row.hts,
    duty: parseFloat(row.duty) || 0,
    stage: row.stage,
    stageIndex: row.stage_index,
    etd: row.etd,
    eta: row.eta,
    container: row.container,
    vessel: row.vessel,
    notes: row.notes || '',
    tags: row.tags || [],
    styles: row.styles || [],
    sizes: row.sizes,
    fits: row.fits || [],
    checkIns: row.check_ins || { pd: [], fin: [] },
    payments: [], // loaded separately from po_payments
    history: row.history || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { isAvailable, migrate, getSql, po };
