import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const logistics = require('../../../lib/logistics');
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const store = searchParams.get('store');

    let transfers;
    if (store) transfers = await logistics.transfer.getForStore(store);
    else if (status === 'pending') transfers = await logistics.transfer.getPending();
    else if (status === 'unconfirmed') transfers = await logistics.transfer.getUnconfirmed();
    else transfers = await logistics.transfer.getAll();

    return NextResponse.json({ count: transfers.length, transfers });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { requireAuth } = require('../../../lib/auth');
    await requireAuth(request, 'write');

    const logistics = require('../../../lib/logistics');
    const { emit, Events } = require('../../../lib/events');
    const { str, int } = require('../../../lib/validate');
    const body = await request.json();

    if (!body.toLocation) return NextResponse.json({ error: 'toLocation required' }, { status: 400 });
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items array required with at least one item' }, { status: 400 });
    }

    const items = body.items.map(i => ({
      mpId: str(i.mpId), mpName: str(i.mpName), sku: str(i.sku), qty: int(i.qty, 1),
    }));

    const transfer = await logistics.transfer.create({
      fromLocation: str(body.fromLocation) || 'Reserve',
      toLocation: str(body.toLocation),
      items,
      createdBy: str(body.createdBy),
    });

    await emit(Events.INVENTORY_TRANSFERRED, {
      transferId: transfer.id, from: transfer.from_location, to: transfer.to_location, items,
    });

    return NextResponse.json({ created: true, transfer });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
