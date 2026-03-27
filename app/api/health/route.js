import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { dashboard } = require('../../../lib/dal');
    const health = await dashboard.getHealth();
    return NextResponse.json({ connected: true, database: 'postgres', ...health });
  } catch (e) {
    return NextResponse.json({ connected: false, error: e.message }, { status: 500 });
  }
}
