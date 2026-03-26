// Shopify API version — auto-detected if not set via env var
// Tries multiple versions until one works
const API_VERSIONS = ['2025-04', '2025-01', '2024-10', '2025-07', '2025-10', '2026-01'];
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 8000;
const PAGINATION_TIMEOUT_MS = 25000;

class ShopifyClient {
  constructor({ shop, accessToken, apiVersion }) {
    this.shop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.accessToken = accessToken;
    this.version = apiVersion || process.env.SHOPIFY_API_VERSION || '2025-04';
    this.base = `https://${this.shop}/admin/api/${this.version}`;
  }

  async _request(endpoint, opts = {}, _attempt = 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${this.base}${endpoint}`, {
        ...opts,
        signal: controller.signal,
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
          ...opts.headers,
        },
      });
      clearTimeout(timer);

      if (res.status === 429) {
        if (_attempt >= MAX_RETRIES) throw new Error('Shopify rate limit — max retries exceeded');
        const wait = parseFloat(res.headers.get('Retry-After') || '2');
        await new Promise(r => setTimeout(r, Math.min(wait * 1000, 10000)));
        return this._request(endpoint, opts, _attempt + 1);
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
      }

      if (res.status === 204) return { _headers: res.headers };
      const data = await res.json();
      data._headers = res.headers;
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (_attempt < MAX_RETRIES && isTransient(err)) {
        const backoff = Math.min(1000 * Math.pow(2, _attempt), 8000);
        console.warn(`[Shopify] Retry ${_attempt + 1}/${MAX_RETRIES} after ${backoff}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, backoff));
        return this._request(endpoint, opts, _attempt + 1);
      }
      throw err;
    }
  }

  _qs(defaults, params) {
    return new URLSearchParams({ ...defaults, ...params }).toString();
  }

  async _fetchAll(endpoint, rootKey, params = {}, maxPages = 20) {
    const results = [];
    let url = `${this.base}${endpoint}?${new URLSearchParams({ limit: '250', ...params })}`;
    let page = 0;
    const deadline = Date.now() + PAGINATION_TIMEOUT_MS;

    while (url && page < maxPages) {
      if (Date.now() > deadline) {
        console.warn(`[Shopify] Pagination timeout after ${page} pages, ${results.length} items`);
        break;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json',
          },
        });
        clearTimeout(timer);

        if (res.status === 429) {
          const wait = parseFloat(res.headers.get('Retry-After') || '2');
          await new Promise(r => setTimeout(r, Math.min(wait * 1000, 10000)));
          continue;
        }
        if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text().catch(() => '')}`);

        const data = await res.json();
        const items = data[rootKey] || [];
        results.push(...items);

        const link = res.headers.get('link') || '';
        const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
        page++;
      } catch (err) {
        clearTimeout(timer);
        if (isTransient(err) && results.length > 0) {
          console.warn(`[Shopify] Pagination error on page ${page}, returning ${results.length} partial results`);
          break;
        }
        throw err;
      }
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

  // ── Variants / Webhooks / Adjustments ──
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
  getShop() { return this._request('/shop.json'); }
}

function isTransient(err) {
  if (err.name === 'AbortError') return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('econnreset') || msg.includes('etimedout') ||
    msg.includes('enotfound') || msg.includes('socket hang up') ||
    msg.includes('network') || msg.includes('fetch failed') ||
    msg.includes('aborted');
}

// Cached client — avoids /shop.json check on every invocation
let _cachedClient = null;
let _clientExpiry = 0;
let _resolvedShop = null;

async function createClient() {
  if (_cachedClient && Date.now() < _clientExpiry) return _cachedClient;

  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) {
    console.error('[shopify] Missing SHOPIFY_ACCESS_TOKEN');
    return null;
  }

  // Try env var first, then known store URLs
  const candidates = [
    process.env.SHOPIFY_STORE_URL,
    'atica-man.myshopify.com',
    'aticaman.myshopify.com',
    'atica-brand.myshopify.com',
  ].filter(Boolean);

  // If we already resolved a working store, try it first
  if (_resolvedShop && !candidates.includes(_resolvedShop)) {
    candidates.unshift(_resolvedShop);
  }

  // Versions to try (env var first, then common ones)
  const versions = process.env.SHOPIFY_API_VERSION
    ? [process.env.SHOPIFY_API_VERSION, ...API_VERSIONS.filter(v => v !== process.env.SHOPIFY_API_VERSION)]
    : API_VERSIONS;

  for (const shop of candidates) {
    for (const version of versions) {
      try {
        const client = new ShopifyClient({ shop, accessToken: token, apiVersion: version });
        await client._request('/shop.json');
        _cachedClient = client;
        _clientExpiry = Date.now() + 10 * 60 * 1000; // 10 min cache for resolved connection
        _resolvedShop = shop;
        console.log(`[shopify] Connected: ${shop} API ${version}`);
        return client;
      } catch (err) {
        // Only log if it's not a 404 (404 = wrong version, expected)
        if (!err.message.includes('404')) {
          console.warn(`[shopify] ${shop} v${version}: ${err.message}`);
        }
      }
    }
  }

  console.error('[shopify] All combinations failed. Stores:', candidates.join(', '), 'Versions:', versions.join(', '));
  return null;
}

module.exports = { ShopifyClient, createClient };
