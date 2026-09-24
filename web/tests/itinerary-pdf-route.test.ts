import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, HEAD } from '../src/app/(site)/packages/[slug]/itinerary.pdf/route';

/**
 * The download goes through this handler, not the `/api/:path*` rewrite, so the api's per-IP
 * download ceiling is keyed on the visitor rather than on Vercel's hop address.
 */

const ctx = (slug = 'north-goa-beaches') => ({ params: Promise.resolve({ slug }) });
const req = (url: string, method = 'GET', headers: Record<string, string> = {}) =>
  new Request(url, { method, headers });
const fetchMock = vi.fn();

beforeEach(() => {
  process.env.API_URL = 'http://api.test';
  process.env.REVALIDATE_SECRET = 's3cret';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
  delete process.env.REVALIDATE_SECRET;
});

describe('GET /packages/[slug]/itinerary.pdf', () => {
  it('forwards the visitor address under the secret and passes the 302 through', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location: 'https://blob.test/pdf/x.pdf',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'",
        },
      }),
    );
    const res = await GET(
      req('http://web.test/packages/north-goa-beaches/itinerary.pdf', 'GET', {
        'x-forwarded-for': '49.207.1.1, 10.0.0.1',
        'user-agent': 'Pixel 8',
      }),
      ctx(),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://blob.test/pdf/x.pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/packages/north-goa-beaches/itinerary.pdf');
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Client-Ip']).toBe('49.207.1.1');
    expect(headers['X-Internal-Secret']).toBe('s3cret');
    expect(headers['User-Agent']).toBe('Pixel 8');
  });

  it('streams the PDF and passes a 429 with its Retry-After', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('%PDF-1.7', {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="x.pdf"',
        },
      }),
    );
    const pdf = await GET(req('http://web.test/packages/x/itinerary.pdf'), ctx('x'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-disposition')).toBe('inline; filename="x.pdf"');
    expect(await pdf.text()).toBe('%PDF-1.7');

    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"code":"rate_limited"}}', {
        status: 429,
        headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
      }),
    );
    const limited = await GET(req('http://web.test/packages/x/itinerary.pdf'), ctx('x'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('120');
  });

  it('308s a query string to the bare URL without calling the api', async () => {
    const res = await GET(req('http://web.test/packages/x/itinerary.pdf?v=1'), ctx('x'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('itinerary.pdf');
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=86400');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards HEAD as HEAD with no body, and answers 503 when the api is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    );
    const head = await HEAD(req('http://web.test/packages/x/itinerary.pdf', 'HEAD'), ctx('x'));
    expect(head.status).toBe(200);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('HEAD');

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const down = await GET(req('http://web.test/packages/x/itinerary.pdf'), ctx('x'));
    expect(down.status).toBe(503);
  });
});
