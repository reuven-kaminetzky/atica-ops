import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const sc = require('../../../../lib/supply-chain');
    const po = await sc.po.getById(id);
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    return NextResponse.json(po);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const sc = require('../../../../lib/supply-chain');
    const body = await request.json();
    const updated = await sc.po.update(id, body);
    if (!updated) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    return NextResponse.json({ updated: true, purchaseOrder: updated });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
