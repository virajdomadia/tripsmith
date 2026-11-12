import { visitorIp } from '@/lib/enquiry-forward';

/**
 * `POST /api/alerts` — "email me when new dates are added" (v3 C3, R30). A route handler rather
 * than the `/api/:path*` rewrite for the same reason as `/api/waitlist`: Vercel rewrites
 * `X-Forwarded-For` to the web function's own address on that hop, so the api's `alerts:{ip}`
 * limit (5 / 10 min) would put every visitor in one bucket. The real address travels under
 * `X-Client-Ip`, trusted by the api only alongside the shared secret. The api owns every rule;
 * its envelope passes through untouched.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
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
  const res = await fetch(`${apiUrl}/alerts`, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
  }).catch(() => undefined);
  if (!res)
    return Response.json(
      { error: { code: 'internal', message: 'Could not reach the api' } },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  const out = new Headers({
    'Content-Type': res.headers.get('content-type') ?? 'application/json',
    'Cache-Control': 'no-store',
  });
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) out.set('Retry-After', retryAfter);
  return new Response(res.body, { status: res.status, headers: out });
}
