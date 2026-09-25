import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../src/app/api/bookings/route';

/** `POST /api/bookings`: the api's `booking:{ip}` limit only works if the visitor's address
 * reaches it, so the handler forwards it under the shared secret and passes the answer through. */

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.REVALIDATE_SECRET = 's3cret';
  process.env.API_URL = 'https://api.test';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REVALIDATE_SECRET;
  delete process.env.API_URL;
});

const post = (body: unknown) =>
  new Request('https://web.test/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    body: JSON.stringify(body),
  });

describe('POST /api/bookings', () => {
  it('forwards the body and the visitor address under the secret', async () => {
    fetchMock.mockResolvedValue(Response.json({ bookingRef: 'TB-ABC234' }, { status: 201 }));
    const res = await POST(post({ departureId: 'd1' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ bookingRef: 'TB-ABC234' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/bookings');
    expect(init.body).toBe('{"departureId":"d1"}');
    expect(init.headers).toMatchObject({ 'X-Client-Ip': '1.2.3.4', 'X-Internal-Secret': 's3cret' });
  });

  it('passes a refusal through with its Retry-After', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: 'rate_limited', message: 'Too many' } },
        { status: 429, headers: { 'Retry-After': '120' } },
      ),
    );
    const res = await POST(post({}));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 502 when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await POST(post({}));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('internal');
  });
});
