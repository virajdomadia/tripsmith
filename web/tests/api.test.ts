import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { z } from 'zod';
import {
  api,
  ApiRequestError,
  apiErrorResponseSchema,
  errorFromResponse,
  type ApiErrorResponse,
} from '../src/lib/api';
import type { components } from '../src/lib/api-types';

type Meta = components['schemas']['Meta'];
type ErrorCode = components['schemas']['ErrorCode'];

const cookieStore = { toString: () => 'session=abc123' };
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('api() — typed server-side fetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GETs API_URL + path and returns the JSON typed from the contract', async () => {
    const meta: Meta = {
      themes: [{ value: 'beach', label: 'Beach' }],
      badges: [],
      enquiryTypes: [],
      limits: {
        maxTravellers: 12,
        maxThemesPerPackage: 3,
        enquiryMessageMax: 1000,
        imageMaxBytes: 1,
      },
    };
    const fetchMock = vi.fn(async () => jsonResponse(meta));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api('/meta', { tags: ['meta'] });

    expect(result).toEqual(meta);
    expectTypeOf(result).toEqualTypeOf<Meta>();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://localhost:8000/meta');
    expect(init).toMatchObject({ next: { tags: ['meta'] } });
  });

  it('only accepts paths that exist in the contract', () => {
    // @ts-expect-error — /nope is not an operation in api/openapi.json
    void api('/nope');
  });

  it('forwards the request cookies and disables caching when auth is requested', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/health', { auth: true });

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).get('cookie')).toBe('session=abc123');
    expect(init.cache).toBe('no-store');
  });

  it('sends no cookie header by default (public data must not vary by viewer)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/health');

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).has('cookie')).toBe(false);
  });

  it('throws ApiRequestError carrying the envelope on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'not_found', message: 'No such package' } }, { status: 404 }),
      ),
    );

    const err = await api('/meta').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(404);
    expect((err as ApiRequestError).body.code).toBe('not_found');
    expectTypeOf<ApiRequestError['body']['code']>().toEqualTypeOf<ErrorCode>();
  });
});

describe('error envelope', () => {
  it('the runtime schema is exactly the generated ApiErrorResponse type', () => {
    expectTypeOf<z.infer<typeof apiErrorResponseSchema>>().toEqualTypeOf<
      components['schemas']['ApiErrorResponse']
    >();
    expectTypeOf<ApiErrorResponse>().toEqualTypeOf<components['schemas']['ApiErrorResponse']>();
  });
});

describe('errorFromResponse', () => {
  it('uses the api envelope when the body is one', () => {
    const err = errorFromResponse(400, 'Bad Request', {
      error: { code: 'validation', message: 'Invalid request', fieldErrors: { month: 'bad' } },
    });
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(400);
    expect(err.body).toEqual({
      code: 'validation',
      message: 'Invalid request',
      fieldErrors: { month: 'bad' },
    });
    expect(err.message).toBe('Invalid request');
  });
  it('falls back to a generic envelope for non-envelope JSON (a gateway 502)', () => {
    const err = errorFromResponse(502, 'Bad Gateway', { message: 'upstream down' });
    expect(err.status).toBe(502);
    expect(err.body).toEqual({ code: 'internal', message: 'Bad Gateway' });
  });
  it('falls back when the body is null or absent', () => {
    expect(errorFromResponse(503, '', null).body).toEqual({
      code: 'internal',
      message: 'HTTP 503',
    });
    expect(errorFromResponse(503, '', undefined).body.message).toBe('HTTP 503');
  });
});
