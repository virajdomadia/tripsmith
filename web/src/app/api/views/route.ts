import { visitorIp } from '@/lib/enquiry-forward';

/**
 * `POST /api/views` — the package page's view beacon (F14). A route handler rather than the
 * `/api/:path*` rewrite for the same reason as the enquiry and login paths: Vercel rewrites
 * `X-Forwarded-For` to the web function's own egress address on that hop, so an api-side per-IP
 * rule keyed off it would put every visitor in one bucket. The real address travels under
 * `X-Client-Ip`, which the api trusts only alongside the shared secret (H4 added a 60 / 10 min
 * ceiling on this endpoint, and the ceiling is only meaningful if the key is the visitor).
 *
 * Fire-and-forget both ways: the beacon ignores the answer, so every outcome is a bare 204 and
 * nothing here ever throws into a 500.
 */

const noContent = () =>
  new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  const raw: unknown = await request.json().catch(() => undefined);
  const slug =
    typeof raw === 'object' && raw !== null && 'slug' in raw && typeof raw.slug === 'string'
      ? raw.slug
      : '';
  // A malformed body is dropped here rather than forwarded: the api would answer 400 and the
  // beacon would ignore it, so the round trip buys nothing.
  if (!slug) return noContent();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // The api's bot filter reads this; without it every view would count as a crawler.
    'User-Agent': request.headers.get('user-agent') ?? 'tripsmith-web',
  };
  const ip = visitorIp(request);
  const secret = process.env.REVALIDATE_SECRET;
  if (ip && secret) {
    headers['X-Client-Ip'] = ip;
    headers['X-Internal-Secret'] = secret;
  }
  // Read per call, not at module scope: tests override `process.env.API_URL` after this module
  // is first imported, and a module-level constant would freeze the pre-test default forever.
  const apiUrl = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  await fetch(`${apiUrl}/views`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug }),
    cache: 'no-store',
  }).catch(() => undefined);
  return noContent();
}
