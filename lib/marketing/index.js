/**
 * lib/marketing/index.js — Marketing Domain
 *
 * Driving demand: campaigns, ad spend, ROAS, attribution.
 * Future integrations: Google Ads API, Meta Ads API.
 *
 * Subscribes to:
 *   sale.recorded → attribution matching
 *   customer.created → audience sync
 *   inventory.low → pause ads for low-stock products
 */

module.exports = {
  // --- Will be implemented when ad platform APIs are connected ---
  // getCampaigns()
  // getCampaignROAS(campaignId)
  // getDailySpend(dateRange)
  // attributeSale(saleId)
  // uploadAudience(segment)
};
