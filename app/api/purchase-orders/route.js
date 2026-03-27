import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sc = require('../../../lib/supply-chain');
    const rows = await sc.po.getAll();
    return NextResponse.json({ count: rows.length, purchaseOrders: rows });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const sc = require('../../../lib/supply-chain');
    const { emit, Events } = require('../../../lib/events');
    const { validatePOCreate } = require('../../../lib/validate');

    const body = await request.json();
    const validation = validatePOCreate(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const po = await sc.po.create(validation.data);
    await emit(Events.PO_CREATED, po);
    return NextResponse.json({ created: true, purchaseOrder: po });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
