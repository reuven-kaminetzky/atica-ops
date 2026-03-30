/**
 * lib/auth.js — Authentication & CORS
 *
 * Auth strategy (checked in order):
 *   1. Same-origin browser requests → always allowed (user is on the site)
 *   2. X-Api-Key header → checked against ATICA_API_KEY env var or DB tokens
 *   3. Server-side / internal calls (no origin) → allowed with basic scopes
 *   4. Everything else → rejected
 *
 * No SKIP_AUTH toggle. Same-origin detection is the primary gate.
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
 * isSameOrigin — checks if the request comes from our own site.
 * Matches against process.env.URL (Netlify sets this) or known site URLs.
 */
function isSameOrigin(origin) {
  if (!origin) return false;
  const clean = origin.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  // Check against Netlify's URL env var
  const siteUrl = (process.env.URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  if (siteUrl && clean.startsWith(siteUrl)) return true;
  // Check against known site domains
  if (clean.includes('atica-ops-v3.netlify.app')) return true;
  if (clean.includes('atica-ops.netlify.app')) return true;
  // Localhost for dev
  if (clean.startsWith('localhost') || clean.startsWith('127.0.0.1')) return true;
  return false;
}

/**
 * authenticate() — for Netlify Functions (event-based)
 */
function authenticate(event) {
  if (event.httpMethod === 'OPTIONS') return { ok: true };

  // 1. Same-origin browser requests — always allowed
  const origin = event.headers.origin || event.headers.referer || '';
  if (isSameOrigin(origin)) {
    return { ok: true, source: 'session' };
  }

  // 2. API key
  const apiKey = event.headers['x-api-key'];
  if (apiKey) {
    const envKey = process.env.ATICA_API_KEY;
    if (envKey && apiKey === envKey) return { ok: true, source: 'api_key' };
    return { ok: false, error: 'Invalid API key' };
  }

  // 3. No origin + no API key = internal/server call
  if (!origin) {
    return { ok: true, source: 'internal' };
  }

  return { ok: false, error: 'Unauthorized' };
}

/**
 * authenticateRequest() — for Next.js API routes (Request-based)
 */
async function authenticateRequest(request) {
  if (request.method === 'OPTIONS') return { ok: true };

  // 1. Same-origin browser requests — always allowed
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (isSameOrigin(origin)) {
    return { ok: true, source: 'session', scopes: ['read', 'write', 'admin', 'sync'] };
  }

  const apiKey = request.headers.get('x-api-key');

  // 2. Database token (atk_ prefix)
  if (apiKey && apiKey.startsWith('atk_')) {
    try {
      const { tokens } = require('./dal/auth');
      const result = await tokens.verify(apiKey);
      if (result.valid) return { ok: true, source: 'token', scopes: result.scopes, tokenName: result.name };
      return { ok: false, error: result.error };
    } catch { /* api_tokens table may not exist */ }
  }

  // 3. Env-var API key
  if (apiKey) {
    const envKey = process.env.ATICA_API_KEY;
    if (envKey && apiKey === envKey) return { ok: true, source: 'api_key', scopes: ['read', 'write', 'admin'] };
    return { ok: false, error: 'Invalid API key' };
  }

  // 4. No origin + no API key = internal/server call
  if (!origin) {
    return { ok: true, source: 'internal', scopes: ['read', 'write'] };
  }

  return { ok: false, error: 'Unauthorized — provide X-Api-Key header' };
}

/**
 * requireAuth(request, requiredScope?) — convenience for Next.js routes
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
