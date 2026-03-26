import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { createClient } = require('../../../../lib/shopify');
    const client = await createClient();
    if (!client) {
      return NextResponse.json({ error: 'Shopify not configured' }, { status: 503 });
    }

    const path = (await params).path || [];
    const endpoint = path.join('/');

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);

    let result;
    switch (endpoint) {
      case 'status': {
        const shop = await client.getShop();
        result = { connected: true, ...shop.shop };
        break;
      }
      case 'products': {
        const data = await client.getProducts(queryParams);
        result = data;
        break;
      }
      case 'orders': {
        const data = await client.getOrders(queryParams);
        result = data;
        break;
      }
      case 'locations': {
        const data = await client.getLocations();
        result = data;
        break;
      }
      case 'customers': {
        const data = await client.getCustomers(queryParams);
        result = data;
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown endpoint: ${endpoint}` }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
