import { forwardAuth, isSameOriginPost, passThrough } from '@/lib/auth/forward';

/**
 * `POST /api/account/saved/merge` — a guest's ♡ saves join the account on sign-in (R39, P1).
 * The browser clears its own list only after this answers 200.
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
  return passThrough(await forwardAuth('/account/saved/merge', request, body));
}
