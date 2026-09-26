import { forwardAuth, isSameOriginPost, passThrough } from '@/lib/auth/forward';

const REF = /^TB-[A-Z0-9]{6}$/;

/**
 * `POST /api/account/bookings/{ref}/review` — the review form on a completed My trips booking
 * (R21, B13). A handler rather than the `/api` rewrite so the session cookie travels exactly as
 * the browser sent it (see api.ts) and cross-site posts are refused here. The api owns every
 * rule (completed trips only, once) and answers in its envelope, passed through.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  if (!isSameOriginPost(request)) return new Response('Forbidden', { status: 403 });
  const { ref } = await params;
  if (!REF.test(ref))
    return Response.json(
      { error: { code: 'not_found', message: 'No booking with that reference' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'validation', message: 'Send JSON' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return passThrough(await forwardAuth(`/account/bookings/${ref}/review`, request, body));
}
