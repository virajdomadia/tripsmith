import { visitorIp } from '@/lib/enquiry-forward';

/**
 * `GET|HEAD /packages/{slug}/itinerary.pdf` — the itinerary download (F11) through a route
 * handler rather than the `/api/:path*` rewrite, for the same reason as `/api/views`: on the
 * rewrite hop Vercel stamps its own address in `X-Forwarded-For`, so the api's per-IP download
 * ceiling (v1.0.1) would put every visitor in one bucket and let one client lock everyone out.
 * The real address travels under `X-Client-Ip`, trusted by the api only alongside the secret.
 *
 * It lives outside `/api/` because a dynamic handler there loses to the rewrite (Next checks
 * `afterFiles` rewrites before dynamic routes). The api's answer is passed through as-is: the
 * 302 to the Blob copy, the streamed PDF when there is no store, a 404 or 429 envelope with its
 * `Retry-After`. The api route stays reachable directly (and via the rewrite) for old links.
 */

type Ctx = { params: Promise<{ slug: string }> };

// What the browser needs from the api's answer; everything else (its CSP, request id, …) stays.
const PASSED_HEADERS = [
  'location',
  'cache-control',
  'content-type',
  'content-disposition',
  'retry-after',
];

/** A query string never changes the PDF; answered like the api does, without a round trip. */
const CANONICAL_CACHE = 'public, s-maxage=86400';

async function forward(request: Request, { params }: Ctx, method: 'GET' | 'HEAD') {
  if (new URL(request.url).search) {
    return new Response(null, {
      status: 308,
      headers: { Location: 'itinerary.pdf', 'Cache-Control': CANONICAL_CACHE },
    });
  }
  const { slug } = await params;
  const headers: Record<string, string> = {
    'User-Agent': request.headers.get('user-agent') ?? 'tripsmith-web',
  };
  const ip = visitorIp(request);
  const secret = process.env.REVALIDATE_SECRET;
  if (ip && secret) {
    headers['X-Client-Ip'] = ip;
    headers['X-Internal-Secret'] = secret;
  }
  // Read per call, not at module scope: tests override `process.env.API_URL` after import.
  const apiUrl = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  const res = await fetch(`${apiUrl}/packages/${encodeURIComponent(slug)}/itinerary.pdf`, {
    method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  }).catch(() => undefined);
  if (!res) {
    return new Response('The itinerary is unavailable right now — please try again shortly.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
  }
  const out = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = res.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  return new Response(method === 'HEAD' ? null : res.body, { status: res.status, headers: out });
}

export const GET = (request: Request, ctx: Ctx) => forward(request, ctx, 'GET');
export const HEAD = (request: Request, ctx: Ctx) => forward(request, ctx, 'HEAD');
