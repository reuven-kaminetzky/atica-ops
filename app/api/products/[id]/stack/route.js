import { NextResponse } from 'next/server';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const product = require('../../../../../lib/product');
    const { emit, Events } = require('../../../../../lib/events');
    const body = await request.json();

    const result = await product.updateStack(id, body);

    if (result.changed) {
      await emit(Events.STACK_UPDATED, { mpId: id, fields: Object.keys(body), completeness: result.completeness });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
