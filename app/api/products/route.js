import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const product = require('../../../lib/product');
    const rows = await product.getAll();
    return NextResponse.json({ count: rows.length, products: rows });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
