import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** `cookies()` from next/headers, outside a request: a jar the tests can seed and inspect. */
const jar = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    has: (name: string) => store.has(name),
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: vi.fn((name: string, value: string) => void store.set(name, value)),
    delete: vi.fn((name: string) => void store.delete(name)),
  };
});
vi.mock('next/headers', () => ({ cookies: async () => jar }));

const { POST: enquiries } = await import('../src/app/api/enquiries/route');
const { POST: enquire } = await import('../src/app/enquire/route');
const DRAFT = 'ts_enquiry_draft';

/**
 * The web half of the enquiry funnel: `POST /enquire` (no JavaScript, native form post, always a
 * 303) and `POST /api/enquiries` (the JS path, JSON through). Both forward via enquiry-forward.ts,
 * which carries the visitor's address to the api's rate limiter under the shared secret.
 */

const VALID = {
  type: 'standard',
  packageSlug: 'north-goa-beaches',
  name: 'Priya Rao',
  phone: '98450 22110',
  email: 'priya@example.com',
  adults: '2',
  children: '0',
  travelMonth: '2026-11',
  message: 'Anniversary trip, sea view please',
  website: '',
};

const PII = [
  'Priya',
  '9845022110',
  '98450',
  'priya%40example.com',
  'priya@example.com',
  'Anniversary',
];

function formPost(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request('https://web.test/enquire', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields),
  });
}

function jsonPost(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://web.test/api/enquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const created = () =>
  new Response(
    JSON.stringify({
      ref: 'TS-ABC234',
      firstName: 'Priya',
      package: { slug: 'north-goa-beaches', name: 'North Goa Beaches' },
      emailed: true,
    }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  );

const rateLimited = () =>
  new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'Slow down' } }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': '120' },
  });

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.REVALIDATE_SECRET = 's3cret';
  jar.store.clear();
  jar.set.mockClear();
  jar.delete.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.REVALIDATE_SECRET;
});

describe('POST /enquire (no JavaScript)', () => {
  it('303s to the thanks page on success and clears a leftover draft', async () => {
    fetchMock.mockResolvedValue(created());
    jar.store.set(DRAFT, '{"name":"Priya Rao"}');
    const res = await enquire(formPost(VALID));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'https://web.test/enquiry/thanks?ref=TS-ABC234&name=Priya&package=north-goa-beaches&emailed=1',
    );
    expect(jar.delete).toHaveBeenCalledWith(DRAFT);
  });

  it('sends a validation failure back with no personal details in the URL', async () => {
    const res = await enquire(formPost({ ...VALID, email: 'not-an-email', budget: '' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/packages/north-goa-beaches/enquire');
    for (const needle of PII) expect(location.toString()).not.toContain(needle);
    // Choices and the error codes are fine in the query…
    expect(location.searchParams.get('adults')).toBe('2');
    expect(location.searchParams.get('travelMonth')).toBe('2026-11');
    expect(JSON.parse(location.searchParams.get('fieldErrors')!)).toHaveProperty('email');
    // …what the visitor typed rides in a two-minute httpOnly cookie instead.
    expect(jar.set).toHaveBeenCalledOnce();
    const [name, value, options] = jar.set.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe(DRAFT);
    expect(options).toEqual({
      path: '/',
      maxAge: 120,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
    expect(JSON.parse(value)).toMatchObject({ name: 'Priya Rao', email: 'not-an-email' });
  });

  it('never leaves an older draft behind when the new one is empty', async () => {
    jar.store.set(DRAFT, '{"name":"Someone Else"}');
    await enquire(formPost({ type: 'contact', adults: '2', website: '' }));
    expect(jar.set).not.toHaveBeenCalled();
    expect(jar.delete).toHaveBeenCalledWith(DRAFT);
    expect(jar.store.has(DRAFT)).toBe(false);
  });

  it('keeps an api-side validation failure out of the URL too', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'validation',
            message: 'Request validation failed',
            fieldErrors: { phone: 'Enter a 10-digit Indian mobile number' },
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const res = await enquire(formPost({ ...VALID, type: 'contact', packageSlug: '' }));
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/contact');
    expect(location.hash).toBe('#enquire');
    for (const needle of PII) expect(location.toString()).not.toContain(needle);
    expect(JSON.parse(location.searchParams.get('fieldErrors')!)).toEqual({
      phone: 'Enter a 10-digit Indian mobile number',
    });
  });

  it('turns a 429 into the rate-limited message', async () => {
    fetchMock.mockResolvedValue(rateLimited());
    const res = await enquire(formPost(VALID));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('rate_limited');
    for (const needle of PII) expect(location.toString()).not.toContain(needle);
  });

  it('says "internal" when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await enquire(formPost(VALID));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('internal');
  });
});

describe('POST /api/enquiries (JavaScript)', () => {
  it('forwards the visitor address and the shared secret to the api', async () => {
    fetchMock.mockResolvedValue(created());
    const res = await enquiries(
      jsonPost(VALID, { 'x-forwarded-for': '49.207.1.1, 10.0.0.1', 'user-agent': 'Pixel 8' }),
    );
    expect(res.status).toBe(201);
    expect(jar.delete).not.toHaveBeenCalled(); // no draft to clear
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/enquiries$/);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Client-Ip']).toBe('49.207.1.1');
    expect(headers['X-Internal-Secret']).toBe('s3cret');
    expect(headers['User-Agent']).toBe('Pixel 8');
    expect(JSON.parse(init.body as string)).toMatchObject({ phone: '9845022110', adults: 2 });
  });

  it('sends neither header without the secret', async () => {
    delete process.env.REVALIDATE_SECRET;
    fetchMock.mockResolvedValue(created());
    await enquiries(jsonPost(VALID, { 'x-forwarded-for': '49.207.1.1' }));
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['X-Client-Ip']).toBeUndefined();
    expect(headers['X-Internal-Secret']).toBeUndefined();
  });

  it('passes a 429 through with its Retry-After', async () => {
    fetchMock.mockResolvedValue(rateLimited());
    const res = await enquiries(jsonPost(VALID));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('rejects junk locally with the api envelope', async () => {
    const res = await enquiries(jsonPost({ ...VALID, phone: '123' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: 'validation',
        fieldErrors: { phone: 'Enter a 10-digit Indian mobile number' },
      },
    });
  });

  it('clears a no-JS draft cookie once the enquiry is in', async () => {
    fetchMock.mockResolvedValue(created());
    jar.store.set(DRAFT, '{}');
    await enquiries(jsonPost(VALID));
    expect(jar.delete).toHaveBeenCalledWith(DRAFT);
  });

  it('answers 502 when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await enquiries(jsonPost(VALID));
    expect(res.status).toBe(502);
  });
});
