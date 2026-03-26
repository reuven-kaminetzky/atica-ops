/**
 * Shared Netlify function handler
 * DRY boilerplate: CORS, auth, routing, error handling, ETag, timing
 * 
 * Usage in each function file:
 *   const { createHandler, RouteError, validate } = require('../../lib/handler');
 *   exports.handler = createHandler(ROUTES, 'products');
 */

const crypto = require('crypto');
const { createClient } = require('./shopify');
const { json, cors, authenticate } = require('./auth');

class RouteError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ── Input Validation Helpers ───────────────────────────────
// Use in route handlers: validate.required(body, ['vendor', 'units'])

const validate = {
  /** Ensure all keys exist in obj. Throws RouteError(400) if missing. */
  required(obj, keys) {
    if (!obj || typeof obj !== 'object') throw new RouteError(400, 'Request body is required');
    const missing = keys.filter(k => obj[k] === undefined || obj[k] === null || obj[k] === '');
    if (missing.length) throw new RouteError(400, `Missing required fields: ${missing.join(', ')}`);
  },

  /** Ensure a number param is within range. Returns parsed int. */
  intParam(params, key, { min = 0, max = 999999, fallback = null } = {}) {
    const raw = (params || {})[key];
    if (raw === undefined || raw === null) return fallback;
    const val = parseInt(raw, 10);
    if (isNaN(val)) throw new RouteError(400, `Invalid ${key}: must be a number`);
    return Math.max(min, Math.min(max, val));
  },

  /** Ensure days param is bounded (default 30, max 365) */
  days(params, fallback = 30) {
    return validate.intParam(params, 'days', { min: 1, max: 365, fallback });
  },

  /** Validate a value is one of an enum list */
  oneOf(value, allowed, fieldName = 'value') {
    if (!allowed.includes(value)) {
      throw new RouteError(400, `${fieldName} must be one of: ${allowed.join(', ')}`);
    }
    return value;
  },

  /** Parse and validate a date string. Returns ISO string or null. */
  date(value, fieldName = 'date') {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new RouteError(400, `Invalid ${fieldName}: must be a valid date`);
    return d.toISOString();
  },
};

function matchRoute(routes, method, path) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeParts = route.path.split('/');
    const pathParts  = path.split('/');
    if (routeParts.length !== pathParts.length) continue;
    const pathParams = {};
    const match = routeParts.every((seg, i) => {
      if (seg.startsWith(':')) { pathParams[seg.slice(1)] = pathParts[i]; return true; }
      return seg === pathParts[i];
    });
    if (match) return { route, pathParams };
  }
  return null;
}

/**
 * Create a Netlify function handler from a route table.
 * @param {Array} routes - [{method, path, handler, noClient?}]
 * @param {string} prefix - URL prefix to strip (e.g. 'products', 'orders')
 */
function createHandler(routes, prefix) {
  return async (event) => {
    const startTime = Date.now();
    const reqId = crypto.randomBytes(4).toString('hex');

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };

    const auth = authenticate(event);
    if (!auth.ok) return json(401, { error: auth.error });

    // Strip prefix from path
    let rawPath = event.path || '';
    rawPath = rawPath
      .replace(new RegExp(`^\\/api\\/${prefix}\\/?`), '')
      .replace(new RegExp(`^\\/?\.netlify\\/functions\\/${prefix}\\/?`), '')
      .replace(/\/$/, '');
    const path = rawPath || '';

    const matched = matchRoute(routes, event.httpMethod, path);
    if (!matched) return json(404, { error: `No route: ${event.httpMethod} /api/${prefix}/${path}` });

    const { route, pathParams } = matched;

    try {
      const client = route.noClient ? null : await createClient();
      if (!route.noClient && !client) {
        return json(503, { error: 'Shopify not configured — set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' });
      }

      // Safe body parsing
      let body = {};
      if (event.body) {
        try { body = JSON.parse(event.body); }
        catch (e) { return json(400, { error: 'Invalid JSON body' }); }
      }

      const ctx = {
        params:     event.queryStringParameters || {},
        body,
        pathParams,
      };

      const result = await route.handler(client, ctx);

      // Standard response headers
      const headers = {
        'X-Response-Time': `${Date.now() - startTime}ms`,
        'X-Request-Id': reqId,
      };

      // ETag for cacheable GET responses
      if (event.httpMethod === 'GET' && result && !result.error) {
        const etag = '"' + crypto.createHash('md5').update(JSON.stringify(result)).digest('hex').slice(0, 12) + '"';
        headers['ETag'] = etag;
        if (event.headers['if-none-match'] === etag) {
          return { statusCode: 304, headers: { ...cors(), ...headers } };
        }
      }

      return json(200, result, headers);

    } catch (err) {
      const elapsed = Date.now() - startTime;
      const headers = { 'X-Response-Time': `${elapsed}ms`, 'X-Request-Id': reqId };

      if (err instanceof RouteError) {
        return json(err.status, { error: err.message }, headers);
      }

      const msg = err.message || 'Unknown error';

      // Shopify-specific error hints
      if (msg.includes('Shopify 404')) {
        return json(502, {
          error: `Shopify 404: ${msg}`,
          hint: 'API version may be expired. Check function logs.',
        }, headers);
      }

      console.error(`[${prefix}] ${event.httpMethod} /api/${prefix}/${path} ${reqId} (${elapsed}ms):`, msg);
      return json(500, { error: msg }, headers);
    }
  };
}

module.exports = { createHandler, RouteError, validate };
