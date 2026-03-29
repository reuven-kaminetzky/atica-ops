-- Atica Ops — API Auth Tokens
-- Supports multiple named tokens with scopes and expiry.
-- Tokens are SHA-256 hashed — raw value is only shown once at creation.

CREATE TABLE IF NOT EXISTS api_tokens (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,                          -- human label ("Danny's dev token")
  token_hash    TEXT NOT NULL UNIQUE,                   -- SHA-256 hex of the raw token
  token_prefix  TEXT NOT NULL,                          -- first 8 chars for identification
  scopes        TEXT[] NOT NULL DEFAULT '{read}',       -- 'read', 'write', 'admin', 'sync'
  created_by    TEXT,                                   -- who created it
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,                            -- NULL = never expires
  revoked_at    TIMESTAMPTZ,                            -- NULL = active
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON api_tokens (token_prefix);
