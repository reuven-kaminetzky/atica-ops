/**
 * Shopify Admin API Client for Atica Man
 * Works with Shopify Custom App access tokens
 */

const SHOPIFY_API_VERSION = '2024-10';

class ShopifyClient {
  constructor({ shop, accessToken }) {
    if (!shop || !accessToken) throw new Error('shop and accessToken required');
    this.shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.accessToken = accessToken;
    this.baseUrl = `https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  async _request(endpoint, opts = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    });

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return this._request(endpoint, opts);
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Shopify API ${res.status}: ${body}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  // ── Products ──────────────────────────────────────────────
  async getProducts(params = {}) {
    const qs = new URLSearchParams({ limit: '250', ...params });
    return this._request(`/products.json?${qs}`);
  }

  async getProduct(id) {
    return this._request(`/products/${id}.json`);
  }

  async getProductCount() {
    return this._request('/products/count.json');
  }

  // ── Orders ────────────────────────────────────────────────
  async getOrders(params = {}) {
    const qs = new URLSearchParams({
      limit: '250',
      status: 'any',
      ...params,
    });
    return this._request(`/orders.json?${qs}`);
  }

  async getOrder(id) {
    return this._request(`/orders/${id}.json`);
  }

  async getOrderCount(params = {}) {
    const qs = new URLSearchParams({ status: 'any', ...params });
    return this._request(`/orders/count.json?${qs}`);
  }

  // ── Inventory ─────────────────────────────────────────────
  async getLocations() {
    return this._request('/locations.json');
  }

  async getInventoryLevels(locationId, params = {}) {
    const qs = new URLSearchParams({
      limit: '250',
      location_ids: locationId,
      ...params,
    });
    return this._request(`/inventory_levels.json?${qs}`);
  }

  async getInventoryItems(ids) {
    const qs = new URLSearchParams({ ids: ids.join(',') });
    return this._request(`/inventory_items.json?${qs}`);
  }

  async adjustInventory(inventoryItemId, locationId, adjustment) {
    return this._request('/inventory_levels/adjust.json', {
      method: 'POST',
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available_adjustment: adjustment,
      }),
    });
  }

  // ── Variants ──────────────────────────────────────────────
  async getVariants(productId) {
    return this._request(`/products/${productId}/variants.json`);
  }

  // ── Customers ─────────────────────────────────────────────
  async getCustomers(params = {}) {
    const qs = new URLSearchParams({ limit: '250', ...params });
    return this._request(`/customers.json?${qs}`);
  }

  // ── Webhooks ──────────────────────────────────────────────
  async getWebhooks() {
    return this._request('/webhooks.json');
  }

  async createWebhook(topic, address) {
    return this._request('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({
        webhook: { topic, address, format: 'json' },
      }),
    });
  }

  async deleteWebhook(id) {
    return this._request(`/webhooks/${id}.json`, { method: 'DELETE' });
  }

  // ── Pagination helper ─────────────────────────────────────
  async fetchAll(method, params = {}) {
    const results = [];
    let pageInfo = null;
    do {
      const reqParams = pageInfo ? { ...params, page_info: pageInfo } : params;
      const data = await this[method](reqParams);
      const key = Object.keys(data)[0];
      results.push(...data[key]);
      // Shopify uses Link header for cursor pagination — simplified here
      pageInfo = null; // For now, single-page fetch
    } while (pageInfo);
    return results;
  }
}

function createClient() {
  const shop = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!shop || !accessToken) {
    return null;
  }
  return new ShopifyClient({ shop, accessToken });
}

module.exports = { ShopifyClient, createClient };
