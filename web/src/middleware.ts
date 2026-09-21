import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { ADMIN_HOME, gateDecision, hasSessionCookie, loginHref } from '@/lib/auth/gate';

/**
 * Gates `/admin/*` (04 §Auth). With no session cookie the answer needs no network; with one,
 * the api decides (`GET /auth/session` with the raw Cookie header — never re-encoded). Any
 * failure counts as signed out; the api still enforces `require_owner` on its own routes.
 */

const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

async function hasSession(cookie: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/session`, {
      headers: { cookie },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const cookie = request.headers.get('cookie');
  const signedIn = hasSessionCookie(cookie) && cookie !== null && (await hasSession(cookie));
  const { pathname, search } = request.nextUrl;
  const decision = gateDecision(pathname + search, signedIn);

  if (decision.kind === 'allow') return NextResponse.next();
  const target = decision.kind === 'home' ? ADMIN_HOME : loginHref({ next: decision.next });
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  // A cookie the api no longer recognises is dead weight on every request — drop it.
  if (decision.kind === 'login' && hasSessionCookie(cookie))
    response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = { matcher: ['/admin/:path*'] };
