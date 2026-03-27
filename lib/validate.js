/**
 * lib/validate.js — Input Validation for API Routes
 *
 * Every POST/PATCH handler calls validate() before touching the database.
 * Returns { valid: true, data: sanitized } or { valid: false, error: string }.
 *
 * Rules:
 *   - Strings are trimmed and limited to 500 chars
 *   - Numbers are parsed and range-checked
 *   - Dates are validated as ISO strings
 *   - Enums are checked against allowed values
 *   - Missing required fields return clear error messages
 */

function validatePOCreate(body) {
  const errors = [];

  if (!body.vendor && !body.mpId) errors.push('vendor or mpId required');
  if (body.vendor && typeof body.vendor !== 'string') errors.push('vendor must be a string');
  if (body.fob !== undefined && (typeof body.fob !== 'number' || body.fob < 0)) errors.push('fob must be a non-negative number');
  if (body.units !== undefined && (!Number.isInteger(body.units) || body.units < 0)) errors.push('units must be a non-negative integer');
  if (body.duty !== undefined && (typeof body.duty !== 'number' || body.duty < 0 || body.duty > 100)) errors.push('duty must be 0-100');
  if (body.moq !== undefined && (!Number.isInteger(body.moq) || body.moq < 0)) errors.push('moq must be a non-negative integer');
  if (body.lead !== undefined && body.leadDays !== undefined) {
    const lead = body.lead ?? body.leadDays;
    if (!Number.isInteger(lead) || lead < 0) errors.push('lead must be a non-negative integer');
  }
  if (body.etd && isNaN(Date.parse(body.etd))) errors.push('etd must be a valid date');
  if (body.eta && isNaN(Date.parse(body.eta))) errors.push('eta must be a valid date');
  if (body.paymentTerms && !['standard', 'full', 'net30'].includes(body.paymentTerms)) {
    errors.push('paymentTerms must be standard, full, or net30');
  }

  if (errors.length > 0) return { valid: false, error: errors.join('; ') };

  return {
    valid: true,
    data: {
      mpId: str(body.mpId),
      mpName: str(body.mpName),
      mpCode: str(body.mpCode),
      category: str(body.category),
      vendor: str(body.vendor),
      vendorId: str(body.vendorId),
      vendorName: str(body.vendorName || body.vendor),
      fob: num(body.fob, 0),
      units: int(body.units, 0),
      moq: int(body.moq, 0),
      lead: int(body.lead ?? body.leadDays, 0),
      duty: num(body.duty, 0),
      hts: str(body.hts),
      etd: body.etd || null,
      eta: body.eta || null,
      container: str(body.container),
      vessel: str(body.vessel),
      notes: str(body.notes, 2000),
      paymentTerms: body.paymentTerms || 'standard',
      styles: Array.isArray(body.styles) ? body.styles : [],
      sizes: str(body.sizes),
      fits: Array.isArray(body.fits) ? body.fits : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdBy: str(body.createdBy),
    },
  };
}

function validatePOUpdate(body) {
  const errors = [];

  if (body.fob !== undefined && (typeof body.fob !== 'number' || body.fob < 0)) errors.push('fob must be non-negative');
  if (body.units !== undefined && (!Number.isInteger(body.units) || body.units < 0)) errors.push('units must be non-negative integer');
  if (body.duty !== undefined && (typeof body.duty !== 'number' || body.duty < 0 || body.duty > 100)) errors.push('duty must be 0-100');
  if (body.etd && isNaN(Date.parse(body.etd))) errors.push('etd must be a valid date');

  if (errors.length > 0) return { valid: false, error: errors.join('; ') };

  const data = {};
  if (body.vendor_name !== undefined) data.vendor_name = str(body.vendor_name);
  if (body.fob !== undefined) data.fob = num(body.fob, 0);
  if (body.units !== undefined) data.units = int(body.units, 0);
  if (body.moq !== undefined) data.moq = int(body.moq, 0);
  if (body.lead_days !== undefined) data.lead_days = int(body.lead_days, 0);
  if (body.duty !== undefined) data.duty = num(body.duty, 0);
  if (body.hts !== undefined) data.hts = str(body.hts);
  if (body.etd !== undefined) data.etd = body.etd || null;
  if (body.eta !== undefined) data.eta = body.eta || null;
  if (body.container !== undefined) data.container = str(body.container);
  if (body.vessel !== undefined) data.vessel = str(body.vessel);
  if (body.notes !== undefined) data.notes = str(body.notes, 2000);

  return { valid: true, data };
}

function validateStageAdvance(body) {
  const data = { checkedBy: str(body.checkedBy) };
  return { valid: true, data };
}

// ── Sanitizers ────────────────────────────────────────────

function str(val, maxLen = 500) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return String(val).slice(0, maxLen).trim();
  return val.slice(0, maxLen).trim();
}

function num(val, fallback = 0) {
  if (val === null || val === undefined) return fallback;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? fallback : n;
}

function int(val, fallback = 0) {
  if (val === null || val === undefined) return fallback;
  const n = typeof val === 'string' ? parseInt(val, 10) : Math.round(val);
  return isNaN(n) ? fallback : n;
}

module.exports = { validatePOCreate, validatePOUpdate, validateStageAdvance, str, num, int };
