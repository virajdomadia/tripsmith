import { forwardAuth, isSameOriginPost, passThrough } from '@/lib/auth/forward';

/**
 * `POST /api/auth/otp/request` — the My trips sign-in screen's step 1 (send me a code).
 * A handler, not the `/api` rewrite: the api's per-IP limit needs the visitor's address.
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
  return passThrough(await forwardAuth('/auth/otp/request', request, body));
}
