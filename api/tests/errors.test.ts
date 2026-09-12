import { createRoute, z } from '@hono/zod-openapi';
import { searchParamsSchema } from '@tripsmith/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { ApiError } from '../src/errors';

/** Throwaway routes exercising the app-level hooks, so the envelope contract is pinned by tests. */
function appWithProbes() {
  const app = createApp();
  const okBody = { content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } };
  app.openapi(
    createRoute({
      method: 'get',
      path: '/probe/search',
      request: { query: searchParamsSchema },
      responses: { 200: { description: 'ok', ...okBody } },
    }),
    (c) => c.json({ ok: true }),
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/probe/throw',
      responses: { 200: { description: 'ok', ...okBody } },
    }),
    () => {
      throw new Error('boom');
    },
  );
  app.openapi(
    createRoute({
      method: 'get',
      path: '/probe/gone',
      responses: { 200: { description: 'ok', ...okBody } },
    }),
    () => {
      throw new ApiError('not_found', 'no such package');
    },
  );
  return app;
}

describe('error envelope', () => {
  it('maps zod issues to 400 with fieldErrors keyed by path', async () => {
    const res = await appWithProbes().request('/probe/search?maxBudget=abc&month=2026-13');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation');
    expect(Object.keys(body.error.fieldErrors).sort()).toEqual(['maxBudget', 'month']);
  });
  it('keys object-level issues as _root', async () => {
    const res = await appWithProbes().request('/probe/search?nightsMin=5&nightsMax=3');
    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).error.fieldErrors)).toEqual(['nightsMax']);
    const rootSchema = z.object({ a: z.string() }).refine(() => false, { message: 'nope' });
    const app = createApp();
    app.openapi(
      createRoute({
        method: 'get',
        path: '/root',
        request: { query: rootSchema },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.body(null),
    );
    const r2 = await app.request('/root?a=x');
    expect((await r2.json()).error.fieldErrors).toEqual({ _root: 'nope' });
  });
  it('ApiError thrown from a handler uses its own status and code', async () => {
    const res = await appWithProbes().request('/probe/gone');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'no such package' },
    });
  });
  it('unexpected errors become a generic 500 without leaking the message', async () => {
    const res = await appWithProbes().request('/probe/throw');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('internal');
    expect(body.error.message).not.toContain('boom');
  });
  it('openapi.json still generates with a preprocess-based query schema', async () => {
    const res = await appWithProbes().request('/openapi.json');
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()).paths)).toContain('/probe/search');
  });
});
