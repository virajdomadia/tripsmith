import { forwardAuth, passThrough } from '@/lib/auth/forward';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

const SIGNED_OUT = () =>
  Response.json(
    { error: { code: 'unauthorized', message: 'Sign in to continue' } },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );

/**
 * `GET /api/account/saved` — the saved slugs every ♡ on a page paints from (R39, P1). Every page
 * asks once, so a visitor without the session cookie is answered here, without the api hop.
 */
export async function GET(request: Request): Promise<Response> {
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie.split(/;\s*/).some((c) => c.startsWith(`${SESSION_COOKIE}=`))) return SIGNED_OUT();
  return passThrough(await forwardAuth('/account/saved/slugs', request, undefined, 'GET'));
}
