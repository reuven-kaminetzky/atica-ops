import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const logistics = require('../../../lib/logistics');
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    let routes;
    if (date) routes = await logistics.van.getForDate(date);
    else routes = await logistics.van.getActive();

    return NextResponse.json({ count: routes.length, routes });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const logistics = require('../../../lib/logistics');
    const { str } = require('../../../lib/validate');
    const body = await request.json();

    if (!body.date) return NextResponse.json({ error: 'date required' }, { status: 400 });
    if (!Array.isArray(body.stops) || body.stops.length === 0) {
      return NextResponse.json({ error: 'stops array required' }, { status: 400 });
    }

    const route = await logistics.van.create({
      date: body.date,
      driver: str(body.driver),
      stops: body.stops.map(s => ({
        store: str(s.store), transferIds: s.transferIds || [], eta: s.eta || null,
        units: parseInt(s.units) || 0, notes: str(s.notes),
      })),
    });

    return NextResponse.json({ created: true, route });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
