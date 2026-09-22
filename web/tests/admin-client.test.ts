import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../src/lib/api-errors';
import { adminRequest, uploadCover } from '../src/lib/admin/client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('adminRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts JSON through the /api rewrite with same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { id: 'd1' }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await adminRequest<{ id: string }>('/admin/destinations', {
      method: 'POST',
      body: { slug: 'goa' },
    });
    expect(out).toEqual({ id: 'd1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/destinations');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe('{"slug":"goa"}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('returns undefined on 204 and throws ApiRequestError with the envelope otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(adminRequest('/admin/destinations/d1', { method: 'DELETE' })).resolves.toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(409, { error: { code: 'conflict', message: 'Taken', fieldErrors: { slug: 'Taken' } } }),
      ),
    );
    const err = await adminRequest('/admin/destinations', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(409);
    expect((err as ApiRequestError).body.fieldErrors).toEqual({ slug: 'Taken' });
  });
});

describe('uploadCover', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the file as multipart field "file" and returns the url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { url: 'https://b/x.jpg', width: 1, height: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' });
    const out = await uploadCover(file);
    expect(out.url).toBe('https://b/x.jpg');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/destinations/cover');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(new Headers(init.headers).has('content-type')).toBe(false); // the browser sets the boundary
  });
});
