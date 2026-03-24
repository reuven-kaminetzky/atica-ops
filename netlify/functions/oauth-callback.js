exports.handler = async (event) => {
  const code = event.queryStringParameters && event.queryStringParameters.code;
  const shop = (event.queryStringParameters && event.queryStringParameters.shop) || 'atica-brand.myshopify.com';
  if (!code) return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: '<h1>No code</h1>' };
  const CID = 'e74914006b0a691c304beb7bbf733258';
  const CS = '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';
  try {
    const res = await fetch('https://' + shop + '/admin/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CID, client_secret: CS, code: code }),
    });
    const data = await res.json();
    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: '<h1>Token</h1><pre>' + JSON.stringify(data, null, 2) + '</pre>' };
  } catch (err) { return { statusCode: 500, body: err.message }; }
};
