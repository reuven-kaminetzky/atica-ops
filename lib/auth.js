function cors(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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

function authenticate(event) {
  // Always allow OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') return { ok: true };

  // Allow if SKIP_AUTH is set (development / trusted deployment)
  if (process.env.SKIP_AUTH === 'true') return { ok: true, source: 'skip' };

  // Allow API key auth
  const apiKey = event.headers['x-api-key'];
  if (apiKey) {
    if (!process.env.ATICA_API_KEY) return { ok: false, error: 'API key not configured' };
    if (apiKey !== process.env.ATICA_API_KEY) return { ok: false, error: 'Invalid API key' };
    return { ok: true, source: 'api_key' };
  }

  // Allow same-origin requests (browser fetch from the app itself)
  const origin = (event.headers.origin || event.headers.referer || '').replace(/^https?:\/\//, '');
  const siteUrl = (process.env.URL || '').replace(/^https?:\/\//, '');
  if (siteUrl && origin && origin.startsWith(siteUrl)) {
    return { ok: true, source: 'session' };
  }

  // Allow Netlify internal requests (no origin header = server-side)
  if (!event.headers.origin && !event.headers.referer) {
    return { ok: true, source: 'internal' };
  }

  return { ok: false, error: 'Unauthorized — provide X-API-Key header' };
}

module.exports = { cors, json, authenticate };
