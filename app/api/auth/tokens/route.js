import { NextResponse } from 'next/server';

/**
 * GET  /api/auth/tokens — List all tokens (admin)
 * POST /api/auth/tokens — Create a new token (admin)
 */

export async function GET(request) {
  try {
    const { requireAuth } = require('../../../../lib/auth');
    await requireAuth(request, 'admin');

    const { tokens } = require('../../../../lib/dal/auth');
    const list = await tokens.list();
    return NextResponse.json({ tokens: list });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { requireAuth } = require('../../../../lib/auth');
    const auth = await requireAuth(request, 'admin');

    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const validScopes = ['read', 'write', 'admin', 'sync'];
    const scopes = (body.scopes || ['read']).filter(s => validScopes.includes(s));
    if (scopes.length === 0) {
      return NextResponse.json({ error: 'At least one valid scope required' }, { status: 400 });
    }

    const { tokens } = require('../../../../lib/dal/auth');
    const created = await tokens.create({
      name: body.name,
      scopes,
      createdBy: auth.tokenName || auth.source,
      expiresAt: body.expiresAt || null,
    });

    return NextResponse.json({
      message: 'Token created. Save the token value — it will not be shown again.',
      ...created,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
