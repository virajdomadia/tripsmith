import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { forwardAuth, seeOther } from '@/lib/auth/forward';
import { loginHref } from '@/lib/auth/gate';

/**
 * `POST /api/auth/logout` — the Sign out button. The api deletes the session row (best effort);
 * the browser is signed out regardless by expiring the host-only cookie here.
 */
export async function POST(request: Request): Promise<Response> {
  await forwardAuth('/auth/logout', request);
  const out = seeOther(new URL(loginHref({ signedOut: true }), request.url));
  out.headers.set('set-cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return out;
}
