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
    if (res.status === 204) return { _headers: res.headers };
    const data = await res.json();
    data._headers = res.headers;
    return data;
  }

  _qs(defaults, params) {
    return new URLSearchParams({ ...defaults, ...params }).toString();
  }

  // ── Paginated fetch — follows Link headers until all pages collected ──
  async _fetchAll(endpoint, rootKey, params = {}, maxPages = 20) {
    const results = [];
    let url = `${this.base}${endpoint}?${new URLSearchParams({ limit: '250', ...params })}`;
    let page = 0;

    while (url && page < maxPages) {
      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (res.status === 429) {
        const wait = parseFloat(res.headers.get('Retry-After') || '2');
        await new Promise(r => setTimeout(r, wait * 1000));
        continue; // retry same url
      }
      if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);

      const data = await res.json();
      const items = data[rootKey] || [];
      results.push(...items);

      // Parse Link header for next page cursor
      const link = res.headers.get('link') || '';
      const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
      page++;
    }

    return results;
  }

  // ── Products (paginated) ──
  async getProducts(params = {}) {
    const products = await this._fetchAll('/products.json', 'products', params);
    return { products };
  }
  getProduct(id) { return this._request(`/products/${id}.json`); }
  getProductCount() { return this._request('/products/count.json'); }

  // ── Orders (paginated) ──
  async getOrders(params = {}) {
    const orders = await this._fetchAll('/orders.json', 'orders', { status: 'any', ...params });
    return { orders };
  }
  getOrder(id) { return this._request(`/orders/${id}.json`); }
  getOrderCount(params = {}) { return this._request(`/orders/count.json?${this._qs({ status: 'any' }, params)}`); }

  // ── Customers (paginated) ──
  async getCustomers(params = {}) {
    const customers = await this._fetchAll('/customers.json', 'customers', params);
    return { customers };
  }

  // ── Inventory ──
  getLocations() { return this._request('/locations.json'); }
  async getInventoryLevels(locationId, params = {}) {
    const levels = await this._fetchAll('/inventory_levels.json', 'inventory_levels', { location_ids: locationId, ...params });
    return { inventory_levels: levels };
  }
  getInventoryItems(ids) { return this._request(`/inventory_items.json?ids=${ids.join(',')}`); }

  // ── Variants / Webhooks ──
  getVariants(productId) { return this._request(`/products/${productId}/variants.json`); }
  getWebhooks() { return this._request('/webhooks.json'); }
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
  deleteWebhook(id) { return this._request(`/webhooks/${id}.json`, { method: 'DELETE' }); }
}

async function createClient() {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) return null;

  const candidates = [
    process.env.SHOPIFY_STORE_URL,
    'aticaman.myshopify.com',
    'atica-brand.myshopify.com',
  ].filter(Boolean);

  for (const shop of candidates) {
    try {
      const client = new ShopifyClient({ shop, accessToken: token });
      await client._request('/shop.json');
      process.env.SHOPIFY_STORE_URL = shop;
      return client;
    } catch (err) {
      if (!err.message.includes('404') && !err.message.includes('Not Found')) throw err;
    }
  }
  return null;
}

module.exports = { ShopifyClient, createClient };
