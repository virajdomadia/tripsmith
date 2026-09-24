/**
 * v1.0.1: a next.config decision no other test would notice being undone.
 */
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('next.config', () => {
  it('sends /api/docs to the api origin, where Swagger can load its own /openapi.json', async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({
      source: '/api/docs',
      destination: expect.stringMatching(/\/docs$/),
      permanent: false,
    });
  });
});
