import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/account/saved/route';
import { DELETE, PUT } from '../src/app/api/account/saved/[slug]/route';
import { POST as merge } from '../src/app/api/account/saved/merge/route';

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

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (method: string, headers: Record<string, string> = {}, body?: unknown) =>
  new Request('http://web.test/api/account/saved/x', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('GET /api/account/saved (P1)', () => {
  it('answers a visitor without a session itself — no api hop on every page', async () => {
    const res = await GET(req('GET', { cookie: 'other=1' }));
    // A 200, so a guest's console stays clean on every page.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false, slugs: [], max: 60 });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers an expired session the same way', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { code: 'unauthorized', message: 'Sign in' } }, { status: 401 }),
    );
    const res = await GET(req('GET', { cookie: 'ts_session=old' }));
    expect(res.status).toBe(200);
    expect((await res.json()).signedIn).toBe(false);
  });

  it('forwards a signed-in visitor to the api slugs list with the cookie as sent', async () => {
    fetchMock.mockResolvedValue(Response.json({ slugs: ['goa'], max: 60 }));
    const res = await GET(req('GET', { cookie: 'a=1; ts_session=tok' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slugs: ['goa'], max: 60 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/account/saved/slugs');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).cookie).toBe('a=1; ts_session=tok');
  });
});

describe('PUT / DELETE /api/account/saved/{slug} (P1)', () => {
  it('forwards the method to the api', async () => {
    fetchMock.mockResolvedValue(Response.json({ slugs: ['munnar'], max: 60 }));
    expect((await PUT(req('PUT', { cookie: 'ts_session=tok' }), params('munnar'))).status).toBe(
      200,
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/account/saved/munnar');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('PUT');

    await DELETE(req('DELETE', { cookie: 'ts_session=tok' }), params('munnar'));
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('refuses a cross-site write and a malformed slug without calling the api', async () => {
    const cross = await PUT(req('PUT', { 'sec-fetch-site': 'cross-site' }), params('munnar'));
    expect(cross.status).toBe(403);
    const bad = await PUT(req('PUT'), params('../admin'));
    expect(bad.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the api refusal through (the cap)', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: 'conflict', message: 'full', reason: 'saved_full' } },
        { status: 409 },
      ),
    );
    const res = await PUT(req('PUT', { cookie: 'ts_session=tok' }), params('goa'));
    expect(res.status).toBe(409);
    expect((await res.json()).error.reason).toBe('saved_full');
  });
});

describe('POST /api/account/saved/merge (P1)', () => {
  it('forwards the guest list as JSON', async () => {
    fetchMock.mockResolvedValue(Response.json({ slugs: ['goa'], max: 60, added: 1, leftOut: 0 }));
    const items = [{ slug: 'goa', at: '2026-10-01T10:00:00Z' }];
    const res = await merge(req('POST', { cookie: 'ts_session=tok' }, { items }));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/account/saved/merge');
    expect(JSON.parse(String(init.body))).toEqual({ items });
  });

  it('refuses a body that is not JSON', async () => {
    const res = await merge(
      new Request('http://web.test/api/account/saved/merge', { method: 'POST', body: 'nope' }),
    );
    expect(res.status).toBe(400);
  });
});
