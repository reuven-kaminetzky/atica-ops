// lib/analytics.js — proxy to lib/shopify/analytics
const { sinceDate, buildVelocity, buildSalesSummary } = require('./shopify/analytics');
module.exports = { sinceDate, buildVelocity, buildSalesSummary };
