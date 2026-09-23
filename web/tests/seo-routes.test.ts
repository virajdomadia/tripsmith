import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * H1: `/sitemap.xml` and `/robots.txt`. The sitemap route calls the api, so the client is mocked
 * here the way `destinations.test.ts` mocks it — these assertions are about which URLs end up in
 * the file, not about the network.
 */
const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api }));

const PACKAGES = {
  items: [{ slug: 'north-goa-beaches' }, { slug: 'munnar-alleppey' }],
  total: 2,
  facets: { destinations: [], themes: [], months: [] },
};
const DESTINATIONS = { items: [{ slug: 'goa' }, { slug: 'kerala' }] };

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((path: string) =>
    Promise.resolve(path === '/packages' ? PACKAGES : DESTINATIONS),
  );
});

describe('sitemap', () => {
  it('lists every public page as an absolute URL', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain('http://localhost:3000/');
    expect(urls).toContain('http://localhost:3000/packages');
    expect(urls).toContain('http://localhost:3000/destinations');
    expect(urls).toContain('http://localhost:3000/about');
    expect(urls).toContain('http://localhost:3000/contact');
    for (const slug of ['terms', 'privacy', 'cancellation-policy']) {
      expect(urls).toContain(`http://localhost:3000/${slug}`);
    }
    expect(urls.every((u) => u.startsWith('http'))).toBe(true);
  });

  it('adds a row per package and destination the api returns', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain('http://localhost:3000/packages/north-goa-beaches');
    expect(urls).toContain('http://localhost:3000/packages/munnar-alleppey');
    expect(urls).toContain('http://localhost:3000/destinations/goa');
    expect(urls).toContain('http://localhost:3000/destinations/kerala');
  });

  it('never lists a page that is closed to crawlers', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls.some((u) => u.includes('/admin'))).toBe(false);
    expect(urls.some((u) => u.includes('/enquiry/thanks'))).toBe(false);
    expect(urls.some((u) => u.includes('/enquire'))).toBe(false);
  });

  it('reads the catalogue through the tags an owner save purges', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    await sitemap();

    expect(api).toHaveBeenCalledWith('/packages', { tags: ['packages'] });
    expect(api).toHaveBeenCalledWith('/destinations', { tags: ['destinations'] });
  });

  it('still lists the static pages when the api is unreachable', async () => {
    // CI builds with no api and this route is prerendered, so a failed fetch must not fail the
    // build — the next revalidation fills the catalogue back in.
    api.mockRejectedValue(new TypeError('fetch failed'));
    const { default: sitemap } = await import('@/app/sitemap');

    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain('http://localhost:3000/');
    expect(urls).toContain('http://localhost:3000/packages');
    expect(urls.some((u) => u.includes('/packages/'))).toBe(false);
  });

  it('has no duplicate URLs', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = (await sitemap()).map((e) => e.url);

    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('robots', () => {
  it('opens the site, closes the owner shell and points at the sitemap', async () => {
    const { default: robots } = await import('@/app/robots');
    const out = robots();
    const rule = Array.isArray(out.rules) ? out.rules[0]! : out.rules!;

    expect(rule.allow).toBe('/');
    expect(rule.disallow).toEqual(['/admin', '/api', '/enquiry/thanks']);
    expect(out.sitemap).toBe('http://localhost:3000/sitemap.xml');
  });
});
