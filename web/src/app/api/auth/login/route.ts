import { forwardAuth, isSameOriginPost, seeOther } from '@/lib/auth/forward';
import { type LoginError, loginHref, safeNext } from '@/lib/auth/gate';

/**
 * `POST /api/auth/login` — the sign-in form's target (a native form post; no JavaScript needed).
 * Success: the api's `Set-Cookie` is copied verbatim onto a 303 to `next`. Failure: 303 back to
 * the form with an error code and the email (never the password) in the query.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return new Response('Forbidden', { status: 403 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Non-form Content-Type (JSON, a bot's curl) or a malformed body: keep the 303-back-to-the-
    // form invariant every other failure path holds, rather than letting Next render a 500.
    return seeOther(new URL(loginHref({ error: 'unavailable' }), request.url));
  }
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  const back = (error: LoginError) =>
    seeOther(new URL(loginHref({ error, next, email }), request.url));

  const res = await forwardAuth('/auth/login', request, { email, password });
  if (!res) return back('unavailable');
  if (res.status === 200) {
    const out = seeOther(new URL(next, request.url));
    const cookie = res.headers.get('set-cookie');
    if (cookie) out.headers.set('set-cookie', cookie);
    return out;
  }
  if (res.status === 429) return back('rate_limited');
  if (res.status >= 500) return back('unavailable');
  return back('credentials'); // 401, or 400 for an empty field
}
