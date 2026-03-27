import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const dal = require('../../../lib/dal');
    const rows = await dal.purchaseOrders.getAll();
    return NextResponse.json({ count: rows.length, purchaseOrders: rows });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const dal = require('../../../lib/dal');
    const { emit, Events } = require('../../../lib/events');
    const body = await request.json();
    if (!body.mpId && !body.vendor) {
      return NextResponse.json({ error: 'mpId or vendor required' }, { status: 400 });
    }
    const po = await dal.purchaseOrders.create(body);
    await emit(Events.PO_CREATED, po);
    return NextResponse.json({ created: true, purchaseOrder: po });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
