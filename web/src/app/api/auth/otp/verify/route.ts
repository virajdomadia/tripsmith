import { forwardAuth, isSameOriginPost, passThrough } from '@/lib/auth/forward';

/**
 * `POST /api/auth/otp/verify` — the My trips sign-in screen's step 2 (here is the code).
 * A handler, not the `/api` rewrite: the session cookie a good code opens must reach the browser
 * from the site origin, and the api sees the visitor's address, as for the owner's login.
 * The body goes through as it is — the api validates it and answers in its envelope.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return new Response('Forbidden', { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'validation', message: 'Send JSON' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return passThrough(await forwardAuth('/auth/otp/verify', request, body));
}
