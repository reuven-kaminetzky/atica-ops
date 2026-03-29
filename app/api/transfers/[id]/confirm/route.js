import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { requireAuth } = require('../../../../../lib/auth');
    await requireAuth(request, 'write');

    const { id } = await params;
    const logistics = require('../../../../../lib/logistics');
    const { emit, Events } = require('../../../../../lib/events');
    const body = await request.json();

    const updated = await logistics.transfer.confirm(id, body.confirmedBy || 'store');

    if (updated) {
      await emit(Events.INVENTORY_RECEIVED, {
        transferId: id, location: updated.to_location, items: updated.items,
      });
    }

    return NextResponse.json({ confirmed: true, transfer: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
