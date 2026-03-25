// ═══════════════════════════════════════════════════════════════
// Stallon: /api/shopify/[...path] — All Shopify API routes
//
// Replaces netlify/functions/shopify.js with typed Next.js routes
// Same route table, same response shapes, full backward compat
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient, ShopifyClient } from '@/lib/shopify/client';
import {
  mapProduct, mapOrder, mapLedgerEntry, mapSnapshotProduct, mapSKU,
  buildProductTree,
} from '@/lib/shopify/mappers';
import { sinceDate, buildVelocity, buildSalesSummary } from '@/lib/shopify/analytics';

// ── Auth check ────────────────────────────────────────────────

function authenticate(req: NextRequest): { ok: boolean; error?: string } {
  if (process.env.SKIP_AUTH === 'true') return { ok: true };

  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    if (!process.env.ATICA_API_KEY) return { ok: false, error: 'API key not configured' };
    if (apiKey !== process.env.ATICA_API_KEY) return { ok: false, error: 'Invalid API key' };
    return { ok: true };
  }

  // Same-origin browser requests
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || '';
  if (siteUrl && origin && origin.includes(siteUrl.replace(/^https?:\/\//, ''))) {
    return { ok: true };
  }

  // Server-side (no origin)
  if (!req.headers.get('origin') && !req.headers.get('referer')) {
    return { ok: true };
  }

  return { ok: false, error: 'Unauthorized — provide X-API-Key header' };
}

// ── CORS headers ──────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

// ── Route handlers ────────────────────────────────────────────

async function handleStatus() {
  const client = await createClient();
  if (!client) return json({ connected: false, message: 'Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' });
  try {
    const shop = await client.getShop();
    return json({ connected: true, shop: shop.name, domain: shop.domain, plan: shop.plan_name, currency: shop.currency });
  } catch (err: any) {
    return json({ connected: false, message: err.message });
  }
}

async function handleSyncProducts(client: ShopifyClient) {
  const products = await client.getProducts();
  return json({ count: products.length, products: products.map(mapProduct) });
}

async function handleSyncOrders(client: ShopifyClient, req: NextRequest) {
  let since: string | undefined;
  try { const body = await req.json(); since = body.since; } catch { /* no body */ }
  if (!since) since = req.nextUrl.searchParams.get('since') || undefined;
  const opts = since ? { created_at_min: since } : {};
  const orders = await client.getOrders(opts);
  return json({ count: orders.length, orders: orders.map(mapOrder) });
}

async function handleSyncInventory(client: ShopifyClient) {
  const locations = await client.getLocations();
  const result = [];
  for (const loc of locations) {
    const levels = await client.getInventoryLevels(loc.id);
    result.push({
      locationId: loc.id,
      locationName: loc.name,
      levels: levels.map(l => ({
        inventoryItemId: l.inventory_item_id,
        available: l.available,
        updatedAt: l.updated_at,
      })),
    });
  }
  return json({ locations: result });
}

async function handleVelocity(client: ShopifyClient, req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
  const orders = await client.getOrders({ created_at_min: sinceDate(days) });
  return json({ days, orderCount: orders.length, velocity: buildVelocity(orders, days) });
}

async function handleSales(client: ShopifyClient, req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
  const orders = await client.getOrders({ created_at_min: sinceDate(days) });
  return json(buildSalesSummary(orders, days));
}

async function handleLedger(client: ShopifyClient, req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10);
  const orders = await client.getOrders({ created_at_min: sinceDate(days) });
  const entries = orders.map(mapLedgerEntry);
  return json({ days, entries: entries.length, ledger: entries });
}

async function handleSnapshot(client: ShopifyClient) {
  const products = await client.getProducts();
  return json({ timestamp: new Date().toISOString(), products: products.map(mapSnapshotProduct) });
}

async function handleSkuMap(client: ShopifyClient, req: NextRequest) {
  const products = await client.getProducts();
  const map = products.flatMap(p => p.variants.map(v => mapSKU(p, v)));
  const filter = req.nextUrl.searchParams.get('filter');
  const filtered = filter && filter !== 'all'
    ? map.filter(s => s.sku.toLowerCase().includes(filter.toLowerCase()))
    : map;
  return json({ count: filtered.length, skuMap: filtered });
}

async function handleTitles(client: ShopifyClient) {
  const products = await client.getProducts();
  return json({
    count: products.length,
    titles: products.map(p => ({
      title: p.title,
      productType: p.product_type,
      status: p.status,
      variants: p.variants.length,
      price: p.variants[0]?.price || '0',
    })).sort((a, b) => a.title.localeCompare(b.title)),
  });
}

async function handleWebhooksSetup(client: ShopifyClient, req: NextRequest) {
  const body = await req.json();
  if (!body.base_url) return json({ error: 'base_url required' }, 400);
  const topics = ['orders/create', 'orders/updated', 'products/update', 'inventory_levels/update'];
  const existing = await client.getWebhooks();
  for (const wh of existing) await client.deleteWebhook(wh.id);
  const created = [];
  for (const topic of topics) {
    const address = `${body.base_url}/api/webhooks/shopify`;
    const webhook = await client.createWebhook(topic, address);
    created.push({ topic, address, id: webhook.id });
  }
  return json({ message: 'Webhooks configured', webhooks: created });
}

// ── Product Tree (new endpoint) ───────────────────────────────

async function handleProductTree(client: ShopifyClient, req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('id');
  if (productId) {
    const product = await client.getProduct(parseInt(productId, 10));
    return json(buildProductTree(product));
  }
  const products = await client.getProducts();
  return json({ count: products.length, trees: products.map(buildProductTree) });
}

// ── Route table ───────────────────────────────────────────────

type RouteHandler = (client: ShopifyClient, req: NextRequest) => Promise<NextResponse>;
type NoClientHandler = (req: NextRequest) => Promise<NextResponse>;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler | NoClientHandler;
  noClient?: boolean;
}

const ROUTES: Route[] = [
  { method: 'GET',  path: 'status',           handler: handleStatus as any,  noClient: true },
  { method: 'POST', path: 'sync/products',    handler: handleSyncProducts },
  { method: 'POST', path: 'sync/orders',      handler: handleSyncOrders },
  { method: 'POST', path: 'sync/inventory',   handler: handleSyncInventory },
  { method: 'GET',  path: 'velocity',         handler: handleVelocity },
  { method: 'GET',  path: 'sales',            handler: handleSales },
  { method: 'GET',  path: 'ledger',           handler: handleLedger },
  { method: 'POST', path: 'snapshot',         handler: handleSnapshot },
  { method: 'GET',  path: 'sku-map',          handler: handleSkuMap },
  { method: 'POST', path: 'webhooks/setup',   handler: handleWebhooksSetup },
  { method: 'GET',  path: 'titles',           handler: handleTitles },
  { method: 'GET',  path: 'products/tree',    handler: handleProductTree },
];

function matchRoute(method: string, pathStr: string) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    if (route.path === pathStr) return { route, pathParams: {} };
  }
  return null;
}

// ── Next.js route handlers ────────────────────────────────────

async function handleRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  // Auth
  const auth = authenticate(req);
  if (!auth.ok) return json({ error: auth.error }, 401);

  // Resolve path
  const pathStr = params.path.join('/');
  const matched = matchRoute(req.method, pathStr);
  if (!matched) return json({ error: `No route: ${req.method} /${pathStr}` }, 404);

  const { route } = matched;

  try {
    if (route.noClient) {
      return await (route.handler as NoClientHandler)(req);
    }

    const client = await createClient();
    if (!client) {
      return json({ error: 'Shopify not configured — set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN' }, 503);
    }

    return await (route.handler as RouteHandler)(client, req);
  } catch (err: any) {
    console.error(`[shopify] ${req.method} ${pathStr}:`, err);
    return json({ error: err.message }, 500);
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PATCH = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const OPTIONS = handleRequest;
