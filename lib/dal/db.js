/**
 * lib/dal/db.js — Database Connection + Audit Helper
 *
 * Single source of truth for database access.
 * Every DAL module imports sql from here.
 * Never call neon() anywhere else.
 */

const { neon } = require('@netlify/neon');

let _sql = null;

function sql() {
  if (!_sql) _sql = neon();
  return _sql;
}

/**
 * audit(entityType, entityId, action, changes, performedBy)
 * Fire-and-forget audit log insert. Never throws.
 */
function audit(entityType, entityId, action, changes, performedBy) {
  try {
    const db = sql();
    db`INSERT INTO audit_log (entity_type, entity_id, action, changes, performed_by)
       VALUES (${entityType}, ${entityId}, ${action}, ${JSON.stringify(changes || {})}, ${performedBy || 'system'})
    `.catch(() => {});
  } catch { /* never block caller */ }
}

module.exports = { sql, audit };
