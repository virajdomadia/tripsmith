import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { ADMIN_HOME, gateDecision, hasSessionCookie, loginHref } from '@/lib/auth/gate';

/**
 * Gates `/admin/*` (04 §Auth). With no session cookie the answer needs no network; with one,
 * the api decides (`GET /auth/session` with the raw Cookie header — never re-encoded). Any
 * failure counts as signed out; the api still enforces `require_owner` on its own routes.
 */

/**
 * `'ok'` and `'unauthorized'` are answers from the api; `'unknown'` covers everything else
 * (5xx, a thrown fetch, a timeout) — a transient failure must not look like a bad cookie.
 */
type SessionCheck = 'ok' | 'unauthorized' | 'unknown';

async function hasSession(cookie: string): Promise<SessionCheck> {
  // Read per call, not at module scope: tests override `process.env.API_URL` after this module
  // is first imported, and a module-level constant would freeze the pre-test default forever.
  const apiUrl = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  try {
    const res = await fetch(`${apiUrl}/auth/session`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'ok';
    if (res.status === 401) return 'unauthorized';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function middleware(request: NextRequest) {
  const cookie = request.headers.get('cookie');
  const hasCookie = hasSessionCookie(cookie);
  // `hasCookie` already implies `cookie !== null`; the extra check just narrows the type.
  const check: SessionCheck =
    hasCookie && cookie !== null ? await hasSession(cookie) : 'unauthorized';
  const signedIn = check === 'ok';
  const { pathname, search } = request.nextUrl;
  const decision = gateDecision(pathname + search, signedIn);

  if (decision.kind === 'allow') return NextResponse.next();
  const target = decision.kind === 'home' ? ADMIN_HOME : loginHref({ next: decision.next });
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  // A cookie the api actively rejected is dead weight on every request — drop it. A transient
  // failure ('unknown') leaves the cookie alone: it may still be good once the api recovers.
  if (decision.kind === 'login' && hasCookie && check === 'unauthorized')
    response.cookies.delete(SESSION_COOKIE);
  return response;
}

// Middleware runs before the `public/` check, so static assets (images, fonts, …) must never
// live under `/admin` — they would be gated too, and the image optimizer's internal fetch
// carries no cookie, so a gated asset 400s. Keep them elsewhere (e.g. `/auth`, `/assets`).
export const config = { matcher: ['/admin/:path*'] };
