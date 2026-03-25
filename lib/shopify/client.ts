// ═══════════════════════════════════════════════════════════════
// Stallon: Shopify API Client for Atica Man
// Entry point: lib/shopify/client.ts
//
// Handles: pagination, rate limiting, retry, all CRUD operations
// Does NOT touch: app/marketplace/ (Shrek) or app/cash-flow/ (Deshawn)
// ═══════════════════════════════════════════════════════════════

import type {
  ShopifyClientConfig,
  ShopifyProduct,
  ShopifyOrder,
  ShopifyLocation,
  ShopifyInventoryLevel,
  ShopifyShop,
  ShopifyWebhook,
  ShopifyCustomer,
} from './types';

const DEFAULT_API_VERSION = '2024-10';

export class ShopifyClient {
  private shop: string;
  private accessToken: string;
  private base: string;

  constructor(config: ShopifyClientConfig) {
    this.shop = config.shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.accessToken = config.accessToken;
    const version = config.apiVersion || DEFAULT_API_VERSION;
    this.base = `https://${this.shop}/admin/api/${version}`;
  }

  // ── Core request with rate-limit retry ──────────────────────

  async request<T>(endpoint: string, opts: RequestInit = {}): Promise<T & { _headers: Headers }> {
    const url = `${this.base}${endpoint}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });

    if (res.status === 429) {
      const wait = parseFloat(res.headers.get('Retry-After') || '2');
      await new Promise(r => setTimeout(r, wait * 1000));
      return this.request<T>(endpoint, opts);
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Shopify ${res.status}: ${body}`);
    }

    if (res.status === 204) {
      return { _headers: res.headers } as T & { _headers: Headers };
    }

    const data = await res.json();
    data._headers = res.headers;
    return data;
  }

  // ── Paginated fetch — follows Link headers ─────────────────

  async fetchAll<T>(
    endpoint: string,
    rootKey: string,
    params: Record<string, string> = {},
    maxPages = 20
  ): Promise<T[]> {
    const results: T[] = [];
    const qs = new URLSearchParams({ limit: '250', ...params }).toString();
    let url: string | null = `${this.base}${endpoint}?${qs}`;
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
        continue;
      }

      if (!res.ok) {
        throw new Error(`Shopify ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const items = data[rootKey] || [];
      results.push(...items);

      // Parse Link header for cursor pagination
      const link = res.headers.get('link') || '';
      const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
      page++;
    }

    return results;
  }

  // ── Shop ────────────────────────────────────────────────────

  async getShop(): Promise<ShopifyShop> {
    const data = await this.request<{ shop: ShopifyShop }>('/shop.json');
    return data.shop;
  }

  // ── Products (paginated) ────────────────────────────────────

  async getProducts(params: Record<string, string> = {}): Promise<ShopifyProduct[]> {
    return this.fetchAll<ShopifyProduct>('/products.json', 'products', params);
  }

  async getProduct(id: number): Promise<ShopifyProduct> {
    const data = await this.request<{ product: ShopifyProduct }>(`/products/${id}.json`);
    return data.product;
  }

  async getProductCount(): Promise<number> {
    const data = await this.request<{ count: number }>('/products/count.json');
    return data.count;
  }

  // ── Orders (paginated) ──────────────────────────────────────

  async getOrders(params: Record<string, string> = {}): Promise<ShopifyOrder[]> {
    return this.fetchAll<ShopifyOrder>('/orders.json', 'orders', { status: 'any', ...params });
  }

  async getOrder(id: number): Promise<ShopifyOrder> {
    const data = await this.request<{ order: ShopifyOrder }>(`/orders/${id}.json`);
    return data.order;
  }

  async getOrderCount(params: Record<string, string> = {}): Promise<number> {
    const qs = new URLSearchParams({ status: 'any', ...params }).toString();
    const data = await this.request<{ count: number }>(`/orders/count.json?${qs}`);
    return data.count;
  }

  // ── Customers (paginated) ───────────────────────────────────

  async getCustomers(params: Record<string, string> = {}): Promise<ShopifyCustomer[]> {
    return this.fetchAll<ShopifyCustomer>('/customers.json', 'customers', params);
  }

  // ── Inventory ───────────────────────────────────────────────

  async getLocations(): Promise<ShopifyLocation[]> {
    const data = await this.request<{ locations: ShopifyLocation[] }>('/locations.json');
    return data.locations;
  }

  async getInventoryLevels(locationId: number, params: Record<string, string> = {}): Promise<ShopifyInventoryLevel[]> {
    return this.fetchAll<ShopifyInventoryLevel>(
      '/inventory_levels.json',
      'inventory_levels',
      { location_ids: String(locationId), ...params }
    );
  }

  async getInventoryItems(ids: number[]): Promise<any[]> {
    const data = await this.request<{ inventory_items: any[] }>(`/inventory_items.json?ids=${ids.join(',')}`);
    return data.inventory_items;
  }

  async adjustInventory(inventoryItemId: number, locationId: number, adjustment: number) {
    return this.request('/inventory_levels/adjust.json', {
      method: 'POST',
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available_adjustment: adjustment,
      }),
    });
  }

  // ── Variants ────────────────────────────────────────────────

  async getVariants(productId: number) {
    const data = await this.request<{ variants: any[] }>(`/products/${productId}/variants.json`);
    return data.variants;
  }

  // ── Webhooks ────────────────────────────────────────────────

  async getWebhooks(): Promise<ShopifyWebhook[]> {
    const data = await this.request<{ webhooks: ShopifyWebhook[] }>('/webhooks.json');
    return data.webhooks;
  }

  async createWebhook(topic: string, address: string): Promise<ShopifyWebhook> {
    const data = await this.request<{ webhook: ShopifyWebhook }>('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    });
    return data.webhook;
  }

  async deleteWebhook(id: number): Promise<void> {
    await this.request(`/webhooks/${id}.json`, { method: 'DELETE' });
  }
}

// ── Factory — auto-detects store URL ──────────────────────────

export async function createClient(): Promise<ShopifyClient | null> {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) return null;

  const candidates = [
    process.env.SHOPIFY_STORE_URL,
    'aticaman.myshopify.com',
  ].filter(Boolean) as string[];

  for (const shop of candidates) {
    try {
      const client = new ShopifyClient({ shop, accessToken: token });
      await client.getShop(); // connectivity check
      return client;
    } catch (err: any) {
      if (!err.message?.includes('404') && !err.message?.includes('Not Found')) {
        throw err;
      }
    }
  }

  return null;
}
