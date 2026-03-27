import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const product = require('../../../../lib/product');
    const mp = await product.getById(id);
    if (!mp) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json(mp);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
