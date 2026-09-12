import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await createApp().request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
  it('unknown route → not_found envelope', async () => {
    const res = await createApp().request('/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });
  it('serves openapi.json listing /health', async () => {
    const doc = await (await createApp().request('/openapi.json')).json();
    expect(Object.keys(doc.paths)).toContain('/health');
  });
});
