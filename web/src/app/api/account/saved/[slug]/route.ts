import { forwardAuth, isSameOriginPost, passThrough } from '@/lib/auth/forward';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `PUT` / `DELETE /api/account/saved/{slug}` — the ♡ on a card or a package page (R39, P1). A
 * handler rather than the `/api` rewrite so the session cookie travels exactly as the browser
 * sent it (see api.ts) and cross-site writes are refused here. The api owns every rule.
 */
async function forward(
  request: Request,
  params: Promise<{ slug: string }>,
  method: 'PUT' | 'DELETE',
): Promise<Response> {
  if (!isSameOriginPost(request)) return new Response('Forbidden', { status: 403 });
  const { slug } = await params;
  if (!SLUG.test(slug) || slug.length > 80)
    return Response.json(
      { error: { code: 'not_found', message: 'That trip is not on the site any more' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  return passThrough(await forwardAuth(`/account/saved/${slug}`, request, undefined, method));
}

export function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return forward(request, params, 'PUT');
}

export function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return forward(request, params, 'DELETE');
}
