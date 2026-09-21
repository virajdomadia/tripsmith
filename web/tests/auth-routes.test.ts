import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';

function formPost(
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const body = new URLSearchParams(fields);
  return new Request(`http://web.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

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

describe('POST /api/auth/login', () => {
  it('forwards JSON with the visitor address and copies Set-Cookie onto a 303', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"user":{}}', {
        status: 200,
        headers: { 'set-cookie': 'ts_session=tok; Path=/; HttpOnly; SameSite=lax' },
      }),
    );
    const res = await login(
      formPost(
        '/api/auth/login',
        { email: 'owner@tripsmith.demo', password: 'pw', next: '/admin/enquiries' },
        { 'x-forwarded-for': '1.2.3.4, 10.0.0.1', 'sec-fetch-site': 'same-origin' },
      ),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/admin/enquiries');
    expect(res.headers.get('set-cookie')).toBe('ts_session=tok; Path=/; HttpOnly; SameSite=lax');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/auth/login');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Client-Ip']).toBe('1.2.3.4');
    expect(headers['X-Internal-Secret']).toBe('s3cret');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'owner@tripsmith.demo',
      password: 'pw',
    });
  });

  it('bounces back with the error code and the email, never the password', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const res = await login(formPost('/api/auth/login', { email: 'o@x.io', password: 'pw' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'http://web.test/admin/login?error=credentials&email=o%40x.io',
    );
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('maps 429 and an unreachable api', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
    let res = await login(formPost('/api/auth/login', { email: 'o@x.io', password: 'pw' }));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('rate_limited');

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    res = await login(formPost('/api/auth/login', { email: 'o@x.io', password: 'pw' }));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('unavailable');
  });

  it('ignores an unsafe next', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await login(
      formPost('/api/auth/login', {
        email: 'o@x.io',
        password: 'pw',
        next: 'https://evil.example',
      }),
    );
    expect(res.headers.get('location')).toBe('http://web.test/admin');
  });

  it('survives a non-form body instead of throwing', async () => {
    const res = await login(
      new Request('http://web.test/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/admin/login?error=unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a cross-site form post', async () => {
    const res = await login(
      formPost(
        '/api/auth/login',
        { email: 'owner@tripsmith.demo', password: 'pw' },
        { 'sec-fetch-site': 'cross-site' },
      ),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/logout', () => {
  it('forwards the cookie, clears it locally and lands on the form', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await logout(formPost('/api/auth/logout', {}, { cookie: 'ts_session=tok' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/admin/login?signedout=1');
    expect(res.headers.get('set-cookie')).toBe(
      'ts_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBe('ts_session=tok');
  });

  it('still signs out locally when the api is down', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const res = await logout(formPost('/api/auth/logout', {}));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('refuses a cross-site form post without clearing the cookie', async () => {
    const res = await logout(formPost('/api/auth/logout', {}, { 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
