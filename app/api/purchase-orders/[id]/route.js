import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const dal = require('../../../../lib/dal');
    const po = await dal.purchaseOrders.getById(id);
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    return NextResponse.json(po);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const dal = require('../../../../lib/dal');
    const body = await request.json();
    const updated = await dal.purchaseOrders.update(id, body);
    if (!updated) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    return NextResponse.json({ updated: true, purchaseOrder: updated });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
