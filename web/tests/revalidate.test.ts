import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (tag: string) => revalidateTag(tag) }));

import { POST } from '../src/app/revalidate/route';

function post(body: unknown, init: RequestInit = {}) {
  return new Request('http://web.test/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

describe('POST /revalidate', () => {
  beforeEach(() => {
    process.env.REVALIDATE_SECRET = 's3cret';
    revalidateTag.mockReset();
  });
  afterEach(() => {
    delete process.env.REVALIDATE_SECRET;
  });

  it('revalidates every tag when the secret matches', async () => {
    const res = await POST(post({ secret: 's3cret', tags: ['packages', 'package:goa-3n'] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: ['packages', 'package:goa-3n'] });
    expect(revalidateTag.mock.calls).toEqual([['packages'], ['package:goa-3n']]);
  });

  it('rejects a wrong secret with 401 and touches nothing', async () => {
    const res = await POST(post({ secret: 'nope', tags: ['packages'] }));

    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects when no secret is configured (never open by accident)', async () => {
    delete process.env.REVALIDATE_SECRET;
    const res = await POST(post({ secret: '', tags: ['packages'] }));

    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400', async () => {
    expect((await POST(post({ secret: 's3cret', tags: 'packages' }))).status).toBe(400);
    expect((await POST(post({ secret: 's3cret', tags: [] }))).status).toBe(400);
    expect((await POST(post({ secret: 's3cret', tags: [''] }))).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('checks the secret before validating the body (no oracle for the body shape)', async () => {
    expect((await POST(post({ secret: 'nope', tags: 'packages' }))).status).toBe(401);
    expect((await POST(post('not json'))).status).toBe(401);
  });
});
