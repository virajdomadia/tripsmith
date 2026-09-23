import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as views } from '../src/app/api/views/route';

/**
 * The beacon goes through a route handler, not the `/api/:path*` rewrite, so the api's per-IP
 * ceiling (H4) is keyed on the visitor rather than on the web function's egress address — the
 * same reason the enquiry and login paths have handlers.
 */

function beacon(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://web.test/api/views', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.API_URL = 'http://api.test';
  process.env.REVALIDATE_SECRET = 's3cret';
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
  delete process.env.REVALIDATE_SECRET;
});

describe('POST /api/views', () => {
  it('forwards the visitor address and user agent under the shared secret', async () => {
    const res = await views(
      beacon(
        { slug: 'north-goa-beaches' },
        { 'x-forwarded-for': '49.207.1.1, 10.0.0.1', 'user-agent': 'Pixel 8 Chrome/128' },
      ),
    );
    expect(res.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/views');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Client-Ip']).toBe('49.207.1.1'); // the visitor, not the hop
    expect(headers['X-Internal-Secret']).toBe('s3cret');
    // The api drops crawlers on the user agent; forwarding ours keeps real visitors countable.
    expect(headers['User-Agent']).toBe('Pixel 8 Chrome/128');
    expect(init.body).toBe(JSON.stringify({ slug: 'north-goa-beaches' }));
  });

  it('drops a junk body instead of spending a round trip on it', async () => {
    for (const body of [{}, { slug: '' }, { slug: 42 }, 'nonsense']) {
      const res = await views(beacon(body));
      expect(res.status).toBe(204);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays a 204 when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await views(beacon({ slug: 'north-goa-beaches' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
