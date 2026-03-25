/**
 * Shared Netlify function handler
 * DRY boilerplate: CORS, auth, routing, error handling, ETag
 * 
 * Usage in each function file:
 *   const { createHandler } = require('../../lib/handler');
 *   exports.handler = createHandler(ROUTES);
 */

const { createClient } = require('./shopify');
const { json, cors, authenticate } = require('./auth');

class RouteError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

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
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };

    const auth = authenticate(event);
    if (!auth.ok) return json(401, { error: auth.error });

    // Strip prefix from path
    let rawPath = event.path || '';
    rawPath = rawPath
      .replace(new RegExp(`^\\/api\\/${prefix}\\/?`), '')
      .replace(new RegExp(`^\\.netlify\\/functions\\/${prefix}\\/?`), '')
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

      const ctx = {
        params:     event.queryStringParameters || {},
        body:       event.body ? JSON.parse(event.body) : {},
        pathParams,
      };

      const result = await route.handler(client, ctx);

      // ETag for cacheable GET responses
      const headers = {};
      if (event.httpMethod === 'GET' && result && !result.error) {
        const crypto = require('crypto');
        const etag = '"' + crypto.createHash('md5').update(JSON.stringify(result)).digest('hex').slice(0, 12) + '"';
        headers['ETag'] = etag;
        const clientEtag = event.headers['if-none-match'];
        if (clientEtag === etag) {
          return { statusCode: 304, headers: { ...cors(), ...headers } };
        }
      }

      return json(200, result, headers);

    } catch (err) {
      if (err instanceof RouteError) return json(err.status, { error: err.message });
      console.error(`[${prefix}] ${event.httpMethod} ${path}:`, err);
      return json(500, { error: err.message });
    }
  };
}

module.exports = { createHandler, RouteError };
