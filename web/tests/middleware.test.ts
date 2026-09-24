import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from '../src/middleware';

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.API_URL = 'http://api.test';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
});

/** A `GET /auth/session` 200 for a user with this role. */
const session = (role: string) =>
  new Response(JSON.stringify({ user: { role }, expiresAt: '2026-10-24T00:00:00Z' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://web.test${path}`, { headers });
}

describe('middleware', () => {
  it('redirects to login with an encoded next when there is no session cookie, without calling the api', async () => {
    const res = await middleware(req('/admin/enquiries?status=new'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'http://web.test/admin/login?next=%2Fadmin%2Fenquiries%3Fstatus%3Dnew',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the cookie when the api says 401', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await middleware(req('/admin', { cookie: 'ts_session=abc' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toContain('ts_session=;');
  });

  it('leaves the cookie alone when the fetch throws (transient failure)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await middleware(req('/admin', { cookie: 'ts_session=abc' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('redirects a signed-in owner away from the login form', async () => {
    fetchMock.mockResolvedValue(session('owner'));
    const res = await middleware(req('/admin/login', { cookie: 'ts_session=abc' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/admin');
  });

  it('passes a signed-in owner through to /admin', async () => {
    fetchMock.mockResolvedValue(session('owner'));
    const res = await middleware(req('/admin', { cookie: 'ts_session=abc' }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('forwards the raw cookie header untouched, and hits API_URL/auth/session', async () => {
    fetchMock.mockResolvedValue(session('owner'));
    await middleware(req('/admin', { cookie: 'theme=dark; ts_session=abc' }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/auth/session');
    expect((init.headers as Record<string, string>).cookie).toBe('theme=dark; ts_session=abc');
  });

  it('sends a signed-in customer to /account and keeps their cookie (R18)', async () => {
    for (const path of ['/admin', '/admin/enquiries', '/admin/login']) {
      fetchMock.mockResolvedValueOnce(session('customer'));
      const res = await middleware(req(path, { cookie: 'ts_session=abc' }));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('http://web.test/account');
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('treats a 200 without a readable role as a transient failure', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    const res = await middleware(req('/admin', { cookie: 'ts_session=abc' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/admin/login');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
