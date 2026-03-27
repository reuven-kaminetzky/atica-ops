/**
 * lib/dal/db.js — Database Connection
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

module.exports = { sql };
