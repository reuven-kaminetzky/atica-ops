import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const sc = require('../../../../../lib/supply-chain');
    const { emit, Events } = require('../../../../../lib/events');
    const { validateStageAdvance } = require('../../../../../lib/validate');

    const body = await request.json();
    const validation = validateStageAdvance(body);
    const result = await sc.po.advanceStage(id, validation.data);

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
