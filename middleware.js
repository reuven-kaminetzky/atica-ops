import { NextResponse } from 'next/server';

/**
 * Auth middleware for Atica Ops v3.
 *
 * When AUTH_TOKEN is set, all dashboard pages and API routes require
 * a valid Bearer token in the Authorization header, or a valid
 * session cookie (set on first successful auth).
 *
 * Excluded from auth:
 *   - /api/webhooks/* (uses HMAC verification)
 *   - /api/health (public health check)
 *   - /_next/* (Next.js internals)
 *
 * Set AUTH_TOKEN in Netlify env vars to enable.
 * Leave unset to keep SKIP_AUTH behavior (open access).
 */

const PUBLIC_PATHS = [
  '/api/webhooks',
  '/api/health',
  '/_next',
  '/favicon.ico',
];

const COOKIE_NAME = 'atica_session';
const COOKIE_MAX_AGE = 86400 * 7; // 7 days

export function middleware(request) {
  const token = process.env.AUTH_TOKEN;

  // No token configured → open access (backward compatible with SKIP_AUTH=true)
  if (!token) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Public paths skip auth
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check session cookie
  const sessionCookie = request.cookies.get(COOKIE_NAME);
  if (sessionCookie?.value === token) {
    return NextResponse.next();
  }

  // Check Authorization header (for API clients)
  const authHeader = request.headers.get('Authorization');
  if (authHeader === `Bearer ${token}`) {
    const response = NextResponse.next();
    // Set session cookie so browser doesn't need to send header every time
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return response;
  }

  // Check query param (for easy browser access: ?token=xxx)
  const queryToken = request.nextUrl.searchParams.get('token');
  if (queryToken === token) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('token');
    const response = NextResponse.redirect(url);
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return response;
  }

  // API routes get 401 JSON
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized. Set Authorization: Bearer <token> header.' },
      { status: 401 }
    );
  }

  // Dashboard pages get 401 HTML
  return new NextResponse(
    `<!DOCTYPE html>
    <html><head><title>Atica Ops — Login</title>
    <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fb}
    .box{text-align:center;max-width:320px}h1{font-size:1.5rem;color:#714b67}
    input{width:100%;padding:0.6rem;border:1px solid #dee2e6;border-radius:6px;font-size:0.9rem;margin:0.5rem 0}
    button{width:100%;padding:0.6rem;background:#714b67;color:white;border:none;border-radius:6px;font-size:0.9rem;cursor:pointer}
    button:hover{background:#5f3d57}</style></head>
    <body><div class="box"><h1>Atica Man OPS</h1><p style="color:#6c757d;font-size:0.85rem">Enter access token</p>
    <form onsubmit="event.preventDefault();window.location.href=window.location.pathname+'?token='+document.getElementById('t').value">
    <input id="t" type="password" placeholder="Access token" autofocus>
    <button type="submit">Sign In</button></form></div></body></html>`,
    { status: 401, headers: { 'Content-Type': 'text/html' } }
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
