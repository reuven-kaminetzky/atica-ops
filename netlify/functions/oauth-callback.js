// OAuth callback handler - exchanges auth code for access token
// Uses env vars: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET
exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;
  const shop = event.queryStringParameters?.shop || 'atica-brand.myshopify.com';

  if (!code) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: '<h1>No code parameter found</h1><pre>' + JSON.stringify(event.queryStringParameters, null, 2) + '</pre>',
    };
  }

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: '<h1>Missing env vars</h1><p>Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Netlify.</p>',
    };
  }

  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });

    const data = await res.json();

    if (data.access_token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<h1>Success! Access Token Received</h1>
<pre>${JSON.stringify(data, null, 2)}</pre>
<p><strong>Next step:</strong> Copy the access_token and update SHOPIFY_ACCESS_TOKEN in Netlify env vars.</p>`,
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<h1>Token Exchange Response</h1><pre>${JSON.stringify(data, null, 2)}</pre>`,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<h1>Error</h1><pre>${err.message}</pre>`,
    };
  }
};
