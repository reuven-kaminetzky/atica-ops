/**
 * lib/dal/auth.js — Data Access for API tokens
 *
 * Tables: api_tokens
 * Tokens are stored hashed. Raw value never persisted.
 */

const { sql } = require('./db');
const crypto = require('crypto');

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateToken() {
  const raw = `atk_${crypto.randomBytes(32).toString('hex')}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

const tokens = {
  async create({ name, scopes = ['read'], createdBy, expiresAt }) {
    const db = sql();
    const { raw, hash, prefix } = generateToken();
    const [row] = await db`
      INSERT INTO api_tokens (name, token_hash, token_prefix, scopes, created_by, expires_at)
      VALUES (${name}, ${hash}, ${prefix}, ${scopes}, ${createdBy || null}, ${expiresAt || null})
      RETURNING id, name, token_prefix, scopes, created_at, expires_at
    `;
    // Return raw token ONLY on creation — caller must display it once
    return { ...row, token: raw };
  },

  async verify(rawToken) {
    const db = sql();
    const hash = hashToken(rawToken);
    const [row] = await db`
      SELECT id, name, scopes, expires_at, revoked_at
      FROM api_tokens
      WHERE token_hash = ${hash}
    `;
    if (!row) return { valid: false, error: 'Token not found' };
    if (row.revoked_at) return { valid: false, error: 'Token revoked' };
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { valid: false, error: 'Token expired' };
    }
    // Update last_used_at (fire and forget)
    db`UPDATE api_tokens SET last_used_at = NOW() WHERE id = ${row.id}`.catch(() => {});
    return { valid: true, tokenId: row.id, name: row.name, scopes: row.scopes };
  },

  async list() {
    const db = sql();
    return db`
      SELECT id, name, token_prefix, scopes, created_by, last_used_at, expires_at, revoked_at, created_at
      FROM api_tokens
      ORDER BY created_at DESC
    `;
  },

  async revoke(id) {
    const db = sql();
    const [row] = await db`
      UPDATE api_tokens SET revoked_at = NOW()
      WHERE id = ${id} AND revoked_at IS NULL
      RETURNING id, name, token_prefix
    `;
    return row;
  },
};

module.exports = { tokens, hashToken, generateToken };
