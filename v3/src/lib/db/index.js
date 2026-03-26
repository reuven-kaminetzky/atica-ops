/**
 * src/lib/db/index.js — Supabase Database Client
 * 
 * Central database access. All queries go through here.
 * Uses Supabase JS client for type-safe queries with RLS.
 * 
 * Usage:
 *   import { db } from '@/lib/db';
 *   const pos = await db.po.findByVendor('TAL');
 *   const po = await db.po.get('PO-2603-ABCD');
 */

// Will use @supabase/supabase-js in production
// For now, define the query interface that all modules code against

// ── PO Queries ──────────────────────────────────────────────

const po = {
  async get(supabase, id) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, po_payments(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async list(supabase, { vendor, mpId, stage, limit = 100 } = {}) {
    let query = supabase
      .from('purchase_orders')
      .select('*, po_payments(*)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (vendor) query = query.eq('vendor', vendor);
    if (mpId) query = query.eq('mp_id', mpId);
    if (stage) query = query.eq('stage', stage);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async findActive(supabase) {
    const { data, error } = await supabase
      .from('active_pos')  // uses the view
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(supabase, po) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert(snakeCaseKeys(po))
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(supabase, id, updates) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(snakeCaseKeys(updates))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(supabase, id) {
    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { deleted: true };
  },

  async countByStage(supabase) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('stage')
    if (error) throw error;
    const counts = {};
    for (const row of data) counts[row.stage] = (counts[row.stage] || 0) + 1;
    return counts;
  },
};

// ── Payment Queries ─────────────────────────────────────────

const payments = {
  async listForPO(supabase, poId) {
    const { data, error } = await supabase
      .from('po_payments')
      .select('*')
      .eq('po_id', poId)
      .order('due_date');
    if (error) throw error;
    return data || [];
  },

  async create(supabase, payment) {
    const { data, error } = await supabase
      .from('po_payments')
      .insert(snakeCaseKeys(payment))
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markPaid(supabase, id, { paidDate, paidAmount }) {
    const { data, error } = await supabase
      .from('po_payments')
      .update({ status: 'paid', paid_date: paidDate, paid_amount: paidAmount })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getOverdue(supabase) {
    const { data, error } = await supabase
      .from('po_payments')
      .select('*, purchase_orders!inner(mp_id, mp_name, vendor)')
      .eq('status', 'overdue')
      .order('due_date');
    if (error) throw error;
    return data || [];
  },

  async getMonthlyProjection(supabase) {
    const { data, error } = await supabase
      .from('monthly_payments')  // uses the view
      .select('*')
      .order('month');
    if (error) throw error;
    return data || [];
  },
};

// ── PLM Queries ─────────────────────────────────────────────

const plm = {
  async get(supabase, mpId) {
    const { data, error } = await supabase
      .from('plm_stages')
      .select('*')
      .eq('mp_id', mpId)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  },

  async upsert(supabase, mpId, updates) {
    const { data, error } = await supabase
      .from('plm_stages')
      .upsert({ mp_id: mpId, ...snakeCaseKeys(updates) })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async list(supabase) {
    const { data, error } = await supabase
      .from('plm_stages')
      .select('*');
    if (error) throw error;
    return data || [];
  },
};

// ── Stack Queries ───────────────────────────────────────────

const stack = {
  async get(supabase, mpId) {
    const { data, error } = await supabase
      .from('product_stack')
      .select('*')
      .eq('mp_id', mpId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async upsert(supabase, mpId, updates) {
    const { data, error } = await supabase
      .from('product_stack')
      .upsert({ mp_id: mpId, ...snakeCaseKeys(updates) })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Shipment Queries ────────────────────────────────────────

const shipment = {
  async get(supabase, id) {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async list(supabase) {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(supabase, shipmentData) {
    const { data, error } = await supabase
      .from('shipments')
      .insert(snakeCaseKeys(shipmentData))
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Audit Queries ───────────────────────────────────────────

const audit = {
  async log(supabase, { entityType, entityId, action, changes, performedBy }) {
    const { error } = await supabase
      .from('audit_log')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        changes,
        performed_by: performedBy,
      });
    if (error) console.error('[audit] Failed to log:', error.message);
  },

  async history(supabase, entityType, entityId) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('performed_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};

// ── Vendor Queries ──────────────────────────────────────────

const vendor = {
  async list(supabase) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async get(supabase, id) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async upsert(supabase, vendorData) {
    const { data, error } = await supabase
      .from('vendors')
      .upsert(snakeCaseKeys(vendorData))
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Helpers ─────────────────────────────────────────────────

function snakeCaseKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = value;
  }
  return result;
}

module.exports = { po, payments, plm, stack, shipment, audit, vendor };
