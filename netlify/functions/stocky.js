/**
 * Stocky API Proxy - Netlify Function
 * Proxies requests to Stocky's API v2 to avoid CORS issues.
 *
 * Routes:
 *   GET /api/stocky/purchase_orders        - list POs
 *   GET /api/stocky/purchase_orders/:id     - single PO with line items
 *   GET /api/stocky/suppliers               - list suppliers
 */

const STOCKY_BASE = 'https://stocky.shopifyapps.com/api/v2';
const STORE_NAME  = 'atica-brand.myshopify.com';

const getApiKey = () => process.env.STOCKY_API_KEY || 'b30b0fd9671ef5dc5da8599dd2c48b67';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body, status = 200) => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const raw = event.path.replace(/^\/api\/stocky\/?/, '').replace(/\/$/, '');
    const segments = raw.split('/').filter(Boolean);

    let endpoint;
    if (segments.length === 0) {
      return json({ ok: true, message: 'Stocky API proxy', endpoints: ['/purchase_orders', '/purchase_orders/:id', '/suppliers'] });
    } else if (segments[0] === 'purchase_orders' && segments.length === 1) {
      endpoint = '/purchase_orders.json';
    } else if (segments[0] === 'purchase_orders' && segments.length === 2) {
      endpoint = '/purchase_orders/' + segments[1] + '.json';
    } else if (segments[0] === 'suppliers' && segments.length === 1) {
      endpoint = '/suppliers.json';
    } else if (segments[0] === 'suppliers' && segments.length === 2) {
      endpoint = '/suppliers/' + segments[1] + '.json';
    } else {
      return json({ error: 'Unknown endpoint: ' + raw }, 404);
    }

    const url = STOCKY_BASE + endpoint;
    const apiKey = getApiKey();

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Store-Name': STORE_NAME,
        'Authorization': 'API KEY=' + apiKey,
        'Accept': 'application/json',
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return json({ error: 'Stocky API error ' + resp.status, detail: text }, resp.status);
    }

    const data = await resp.json();
    return json(data);

  } catch (err) {
    console.error('Stocky proxy error:', err);
    return json({ error: 'Internal proxy error', detail: err.message }, 500);
  }
};
