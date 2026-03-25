// lib/shopify.js
// ── Proxy to lib/shopify/ TypeScript library ─────────────────────────
// Maintained for backward compat. New code should import from lib/shopify/ directly.

const { ShopifyClient, createClient } = require('./shopify/client');
module.exports = { ShopifyClient, createClient };
