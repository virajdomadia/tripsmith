import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `absolute()` exists so a trailing slash on `NEXT_PUBLIC_SITE_URL` cannot produce
 * `https://host//packages/goa` in a canonical while the sitemap says `https://host/packages/goa`.
 * The variable is read at module load, so each case re-imports the module.
 */
async function withSiteUrl(value: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', value);
  return import('@/lib/seo/site-url');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('absolute', () => {
  it('builds the same URL whether or not the origin carries a trailing slash', async () => {
    const plain = await withSiteUrl('https://tripsmith.example');
    const slashed = await withSiteUrl('https://tripsmith.example/');

    expect(plain.absolute('/packages/goa')).toBe('https://tripsmith.example/packages/goa');
    expect(slashed.absolute('/packages/goa')).toBe('https://tripsmith.example/packages/goa');
  });

  it('keeps the root a single slash', async () => {
    const { absolute } = await withSiteUrl('https://tripsmith.example/');
    expect(absolute('/')).toBe('https://tripsmith.example/');
  });

  it('falls back to localhost when the variable is unset', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    const { SITE_URL } = await import('@/lib/seo/site-url');
    expect(SITE_URL).toBe('http://localhost:3000');
  });
});
