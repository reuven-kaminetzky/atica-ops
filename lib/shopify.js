const SHOPIFY_API_VERSION = '2024-10';

class ShopifyClient {
  constructor({ shop, accessToken }) {
    this.shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.accessToken = accessToken;
    this.base = `https://${this.shop}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  async _request(endpoint, opts = {}) {
    const res = await fetch(`${this.base}${endpoint}`, {
      ...opts,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    });

    if (res.status === 429) {
      const wait = parseFloat(res.headers.get('Retry-After') || '2');
      await new Promise(r => setTimeout(r, wait * 1000));
      return this._request(endpoint, opts);
    }
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    if (res.status === 204) return null;
    return res.json();
  }

  _qs(defaults, params) {
    return new URLSearchParams({ ...defaults, ...params }).toString();
  }

  // ── Queries ───────────────────────────────────────────────

  getProducts(params = {}) {
    return this._request(`/products.json?${this._qs({ limit: '250' }, params)}`);
  }

  getProduct(id) {
    return this._request(`/products/${id}.json`);
  }

  getProductCount() {
    return this._request('/products/count.json');
  }

  getOrders(params = {}) {
    return this._request(`/orders.json?${this._qs({ limit: '250', status: 'any' }, params)}`);
  }

  getOrder(id) {
    return this._request(`/orders/${id}.json`);
  }

  getOrderCount(params = {}) {
    return this._request(`/orders/count.json?${this._qs({ status: 'any' }, params)}`);
  }

  getCustomers(params = {}) {
    return this._request(`/customers.json?${this._qs({ limit: '250' }, params)}`);
  }

  getLocations() {
    return this._request('/locations.json');
  }

  getInventoryLevels(locationId, params = {}) {
    return this._request(`/inventory_levels.json?${this._qs({ limit: '250', location_ids: locationId }, params)}`);
  }

  getInventoryItems(ids) {
    return this._request(`/inventory_items.json?ids=${ids.join(',')}`);
  }

  getVariants(productId) {
    return this._request(`/products/${productId}/variants.json`);
  }

  getWebhooks() {
    return this._request('/webhooks.json');
  }

  // ── Mutations ─────────────────────────────────────────────

  adjustInventory(inventoryItemId, locationId, adjustment) {
    return this._request('/inventory_levels/adjust.json', {
      method: 'POST',
      body: JSON.stringify({ location_id: locationId, inventory_item_id: inventoryItemId, available_adjustment: adjustment }),
    });
  }

  createWebhook(topic, address) {
    return this._request('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    });
  }

  deleteWebhook(id) {
    return this._request(`/webhooks/${id}.json`, { method: 'DELETE' });
  }
}

function createClient() {
  const shop = process.env.SHOPIFY_STORE_URL;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  return shop && token ? new ShopifyClient({ shop, accessToken: token }) : null;
}

module.exports = { ShopifyClient, createClient };
