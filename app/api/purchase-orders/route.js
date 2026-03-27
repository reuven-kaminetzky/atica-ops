import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { purchaseOrders } = require('../../../lib/dal');
    const rows = await purchaseOrders.getAll();
    return NextResponse.json({ count: rows.length, purchaseOrders: rows });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { purchaseOrders } = require('../../../lib/dal');
    const body = await request.json();
    if (!body.mpId && !body.vendor) {
      return NextResponse.json({ error: 'mpId or vendor required' }, { status: 400 });
    }
    const po = await purchaseOrders.create(body);
    return NextResponse.json({ created: true, purchaseOrder: po });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
