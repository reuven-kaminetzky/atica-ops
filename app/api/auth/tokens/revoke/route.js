import { NextResponse } from 'next/server';

/**
 * POST /api/auth/tokens/revoke — Revoke a token by ID (admin)
 * Body: { id: number }
 */
export async function POST(request) {
  try {
    const { requireAuth } = require('../../../../../lib/auth');
    await requireAuth(request, 'admin');

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { tokens } = require('../../../../../lib/dal/auth');
    const revoked = await tokens.revoke(body.id);
    if (!revoked) {
      return NextResponse.json({ error: 'Token not found or already revoked' }, { status: 404 });
    }

    return NextResponse.json({ revoked: true, ...revoked });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
