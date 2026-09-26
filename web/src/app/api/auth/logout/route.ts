import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { forwardAuth, isSameOriginPost, seeOther } from '@/lib/auth/forward';
import { ACCOUNT_SIGN_IN, loginHref } from '@/lib/auth/gate';

/**
 * `POST /api/auth/logout` — the Sign out button, in the admin and in My trips (a form field
 * `to=account` sends the customer back to their own sign-in, not the owner's). The api deletes
 * the session row (best effort); the browser is signed out regardless by expiring the host-only
 * cookie here.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData().catch(() => undefined);
  await forwardAuth('/auth/logout', request);
  const target =
    form?.get('to') === 'account'
      ? `${ACCOUNT_SIGN_IN}?signedout=1`
      : loginHref({ signedOut: true });
  const out = seeOther(new URL(target, request.url));
  out.headers.set('set-cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return out;
}
