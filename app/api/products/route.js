import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const product = require('../../../lib/product');
    const products = await product.getAll();
    return NextResponse.json({ count: products.length, products });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
