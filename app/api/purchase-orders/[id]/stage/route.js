import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const dal = require('../../../../../lib/dal');
    const { emit, Events } = require('../../../../../lib/events');
    const body = await request.json();
    const result = await dal.purchaseOrders.advanceStage(id, { checkedBy: body.checkedBy });
    if (result.error) return NextResponse.json(result, { status: 400 });
    await emit(Events.PO_STAGE_ADVANCED, { poId: id, ...result });
    if (result.to === 'received') {
      await emit(Events.PO_RECEIVED, { poId: id, ...result });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
