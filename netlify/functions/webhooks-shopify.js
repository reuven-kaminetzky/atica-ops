const crypto = require('crypto');
const { json, cors } = require('../../lib/auth');

function verify(rawBody, hmac) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true;
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac || ''));
}

async function forward(event) {
  const url = process.env.WEBHOOK_FORWARD_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Atica-Topic':  event.topic,
        'X-Atica-Source': 'shopify',
        ...(process.env.WEBHOOK_FORWARD_SECRET ? { 'X-Atica-Secret': process.env.WEBHOOK_FORWARD_SECRET } : {}),
      },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error('[webhook] forward failed:', err.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  try {
    if (!verify(event.body, event.headers['x-shopify-hmac-sha256'])) {
      return json(401, { error: 'Bad signature' });
    }
  } catch {
    return json(401, { error: 'Bad signature' });
  }

  const topic = event.headers['x-shopify-topic'];
  const payload = JSON.parse(event.body);

  console.log(`[webhook] ${topic} from ${event.headers['x-shopify-shop-domain']}`);

  const webhookEvent = {
    topic,
    shopDomain: event.headers['x-shopify-shop-domain'],
    receivedAt: new Date().toISOString(),
    payload,
  };

  await forward(webhookEvent);
  return json(200, { received: true, topic });
};
