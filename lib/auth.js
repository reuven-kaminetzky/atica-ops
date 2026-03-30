/**
 * lib/auth.js — Authentication & CORS
 *
 * Supports three auth methods:
 *   1. Database API tokens (X-API-Key: atk_...)  → verified against api_tokens table
 *   2. Legacy env-var key  (X-API-Key: <other>)  → checked against ATICA_API_KEY env var
 *   3. Same-origin browser requests              → origin matches site URL
 *
 * SKIP_AUTH=true bypasses everything (dev/trusted deploy).
 */

function cors(headers = {}) {
  const allowed = process.env.CORS_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    ...headers,
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors(), ...extraHeaders },
    body: JSON.stringify(body),
  };
}

/**
 * authenticate() — for Netlify Functions (event-based)
 * Returns { ok, source, scopes?, error? }
 */
function authenticate(event) {
  if (event.httpMethod === 'OPTIONS') return { ok: true };
  if (process.env.SKIP_AUTH === 'true') return { ok: true, source: 'skip' };

  const apiKey = event.headers['x-api-key'];
  if (apiKey) {
    if (!process.env.ATICA_API_KEY) return { ok: false, error: 'API key not configured' };
    if (apiKey !== process.env.ATICA_API_KEY) return { ok: false, error: 'Invalid API key' };
    return { ok: true, source: 'api_key' };
  }

  const origin = (event.headers.origin || event.headers.referer || '').replace(/^https?:\/\//, '');
  const siteUrl = (process.env.URL || '').replace(/^https?:\/\//, '');
  if (siteUrl && origin && origin.startsWith(siteUrl)) {
    return { ok: true, source: 'session' };
  }

  if (!event.headers.origin && !event.headers.referer) {
    return { ok: true, source: 'internal' };
  }

  return { ok: false, error: 'Unauthorized — provide X-API-Key header' };
}

/**
 * authenticateRequest() — for Next.js API routes (Request-based)
 * Checks DB tokens first, falls back to env-var key, then origin.
 * Returns { ok, source, scopes?, tokenName?, error? }
 */
async function authenticateRequest(request) {
  if (request.method === 'OPTIONS') return { ok: true };
  if (process.env.SKIP_AUTH === 'true') return { ok: true, source: 'skip' };

  const apiKey = request.headers.get('x-api-key');

  // Try database token first (atk_ prefix)
  if (apiKey && apiKey.startsWith('atk_')) {
    try {
      const { tokens } = require('./dal/auth');
      const result = await tokens.verify(apiKey);
      if (result.valid) {
        return { ok: true, source: 'token', scopes: result.scopes, tokenName: result.name };
      }
      return { ok: false, error: result.error };
    } catch (e) {
      // api_tokens table may not exist yet — fall through to env var
    }
  }

  // Legacy env-var key
  if (apiKey) {
    if (!process.env.ATICA_API_KEY) return { ok: false, error: 'API key not configured' };
    if (apiKey !== process.env.ATICA_API_KEY) return { ok: false, error: 'Invalid API key' };
    return { ok: true, source: 'api_key', scopes: ['read', 'write', 'admin'] };
  }

  // Same-origin browser requests
  const origin = (request.headers.get('origin') || request.headers.get('referer') || '').replace(/^https?:\/\//, '');
  const siteUrl = (process.env.URL || '').replace(/^https?:\/\//, '');
  if (siteUrl && origin && origin.startsWith(siteUrl)) {
    return { ok: true, source: 'session', scopes: ['read', 'write', 'admin', 'sync'] };
  }

  // Server-side internal requests (no origin)
  if (!request.headers.get('origin') && !request.headers.get('referer')) {
    return { ok: true, source: 'internal', scopes: ['read', 'write'] };
  }

  return { ok: false, error: 'Unauthorized — provide X-API-Key header' };
}

/**
 * requireAuth(request, requiredScope?) — convenience for Next.js routes
 * Throws a Response if unauthorized. Use in route handlers:
 *   const auth = await requireAuth(request, 'write');
 */
async function requireAuth(request, requiredScope) {
  const log = require('./logger');
  const auth = await authenticateRequest(request);
  const route = new URL(request.url).pathname;

  if (!auth.ok) {
    log.warn('auth.denied', { route, method: request.method, error: auth.error });
    throw new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (requiredScope && auth.scopes && !auth.scopes.includes(requiredScope) && !auth.scopes.includes('admin')) {
    log.warn('auth.forbidden', { route, method: request.method, source: auth.source, required: requiredScope, scopes: auth.scopes });
    throw new Response(JSON.stringify({ error: `Missing required scope: ${requiredScope}` }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  log.info('auth.ok', { route, method: request.method, source: auth.source, token: auth.tokenName || undefined });
  return auth;
}

module.exports = { cors, json, authenticate, authenticateRequest, requireAuth };
