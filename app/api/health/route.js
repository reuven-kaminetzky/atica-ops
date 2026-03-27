import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const dal = require('../../../lib/dal');
    return NextResponse.json({ connected: true, ...(await dal.dashboard.getHealth()) });
  } catch (e) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 500 });
  }
}
