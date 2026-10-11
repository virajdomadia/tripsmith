import { forwardAuth, passThrough } from '@/lib/auth/forward';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

// A 200, not a 401: every guest page asks, and a 401 would print a red console error each time.
const SIGNED_OUT = () =>
  Response.json(
    { signedIn: false, slugs: [], max: 60 },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );

/**
 * `GET /api/account/saved` — the saved slugs every ♡ on a page paints from (R39, P1). Every page
 * asks once, so a visitor without the session cookie is answered here, without the api hop; an
 * expired session (the api's 401) is answered the same way.
 */
export async function GET(request: Request): Promise<Response> {
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie.split(/;\s*/).some((c) => c.startsWith(`${SESSION_COOKIE}=`))) return SIGNED_OUT();
  const res = await forwardAuth('/account/saved/slugs', request, undefined, 'GET');
  if (res?.status === 401) return SIGNED_OUT();
  return passThrough(res);
}
