import { stripDraftCookie } from '@/lib/enquiry-form-state';
import { visitorIp } from '@/lib/enquiry-forward';

/**
 * Server-side hop web → api for `/auth/*`. Same reason as enquiry-forward.ts: Vercel rewrites
 * `X-Forwarded-For` on this hop, so the visitor's address travels under `X-Client-Ip` with the
 * shared secret, and the api's `login:{ip}` and `otp-ip:{ip}` limiters see the real browser. The viewer's raw
 * Cookie header is forwarded untouched (never re-encoded — see api.ts).
 */

/**
 * True for a POST the browser marks as ours: `Sec-Fetch-Site` is `same-origin` (a form on the
 * site) or `none` (typed/bookmarked navigation). Cross-site form posts (`cross-site`,
 * `same-site`) are refused; a missing header (old browsers, curl) is allowed — the cookie's
 * SameSite=Lax already stops those from carrying the session anyway.
 */
export function isSameOriginPost(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

export type AuthPath =
  | '/auth/login'
  | '/auth/logout'
  | '/auth/otp/request'
  | '/auth/otp/verify'
  | `/account/bookings/${string}/cancellation`;

export async function forwardAuth(
  path: AuthPath,
  request: Request,
  body?: unknown,
): Promise<Response | undefined> {
  // Read per call, not at module scope: tests override `process.env.API_URL` after this module
  // is first imported, and a module-level constant would freeze the pre-test default forever.
  const apiUrl = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  const headers: Record<string, string> = {
    'User-Agent': request.headers.get('user-agent') ?? 'tripsmith-web',
  };
  // Everything but the enquiry draft (visitor PII the api has no use for).
  const cookie = stripDraftCookie(request.headers.get('cookie'));
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ip = visitorIp(request);
  const secret = process.env.REVALIDATE_SECRET;
  if (ip && secret) {
    headers['X-Client-Ip'] = ip;
    headers['X-Internal-Secret'] = secret;
  }
  return fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => undefined);
}

/** A 303 whose headers stay mutable (`Response.redirect` returns immutable ones). */
export function seeOther(location: URL): Response {
  return new Response(null, { status: 303, headers: { Location: location.toString() } });
}

/**
 * The api's JSON answer passed through for the sign-in code screen (`fetch` from the browser):
 * status, body and `Retry-After` as they came, `Set-Cookie` copied verbatim (a verified code
 * opens the session), never cached. Unreachable → the api's own 502 envelope shape.
 */
export function passThrough(res: Response | undefined): Response {
  if (!res)
    return Response.json(
      { error: { code: 'internal', message: 'Could not reach the server — try again' } },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  const out = new Headers({
    'Content-Type': res.headers.get('content-type') ?? 'application/json',
    'Cache-Control': 'no-store',
  });
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) out.set('Retry-After', retryAfter);
  const cookie = res.headers.get('set-cookie');
  if (cookie) out.set('Set-Cookie', cookie);
  return new Response(res.body, { status: res.status, headers: out });
}
