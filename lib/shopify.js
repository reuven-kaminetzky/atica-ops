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

  // ── Queries ───────────────────────────────────────────────

  _get(path, defaults = {}) {
    return (params = {}) => {
      const qs = new URLSearchParams({ ...defaults, ...params });
      return this._request(`${path}?${qs}`);
    };
  }

  getProducts   = this._get('/products.json',   { limit: '250' });
  getOrders     = this._get('/orders.json',      { limit: '250', status: 'any' });
  getCustomers  = this._get('/customers.json',   { limit: '250' });
  getLocations  = () => this._request('/locations.json');
  getWebhooks   = () => this._request('/webhooks.json');

  getProduct(id)      { return this._request(`/products/${id}.json`); }
  getOrder(id)        { return this._request(`/orders/${id}.json`); }
  getProductCount()   { return this._request('/products/count.json'); }
  getOrderCount(p={}) { return this._request(`/orders/count.json?${new URLSearchParams({ status: 'any', ...p })}`); }
  getVariants(pid)    { return this._request(`/products/${pid}/variants.json`); }

  getInventoryLevels(locationId, params = {}) {
    const qs = new URLSearchParams({ limit: '250', location_ids: locationId, ...params });
    return this._request(`/inventory_levels.json?${qs}`);
  }

  getInventoryItems(ids) {
    return this._request(`/inventory_items.json?${new URLSearchParams({ ids: ids.join(',') })}`);
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
