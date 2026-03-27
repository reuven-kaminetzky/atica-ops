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
    const { validatePOUpdate } = require('../../../../lib/validate');

    const body = await request.json();
    const validation = validatePOUpdate(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const updated = await sc.po.update(id, validation.data);
    if (!updated) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    return NextResponse.json({ updated: true, purchaseOrder: updated });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
