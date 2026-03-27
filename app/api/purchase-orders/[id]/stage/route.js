import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { purchaseOrders } = require('../../../../../lib/dal');
    const body = await request.json();
    const result = await purchaseOrders.advanceStage(id, { checkedBy: body.checkedBy });
    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
