/**
 * Auth middleware for Netlify Functions
 * Supports both session cookies (frontend) and API keys (external apps)
 */

function cors(headers = {}) {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    ...headers,
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors() },
    body: JSON.stringify(body),
  };
}

function authenticate(event) {
  // OPTIONS preflight — always allow
  if (event.httpMethod === 'OPTIONS') return { ok: true };

  // External apps use X-API-Key header
  const apiKey = event.headers['x-api-key'];
  if (apiKey) {
    if (!process.env.ATICA_API_KEY) return { ok: false, error: 'API key not configured' };
    if (apiKey !== process.env.ATICA_API_KEY) return { ok: false, error: 'Invalid API key' };
    return { ok: true, source: 'api_key' };
  }

  // Frontend uses session cookie — for now trust same-origin requests
  const origin = event.headers.origin || event.headers.referer || '';
  const siteUrl = process.env.URL || ''; // Netlify provides this
  if (siteUrl && origin && origin.startsWith(siteUrl)) {
    return { ok: true, source: 'session' };
  }

  // In development or if no origin check needed
  if (process.env.SKIP_AUTH === 'true') {
    return { ok: true, source: 'dev' };
  }

  return { ok: false, error: 'Unauthorized — provide X-API-Key header' };
}

module.exports = { cors, json, authenticate };
