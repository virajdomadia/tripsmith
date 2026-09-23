/**
 * H4: the response headers every page and route handler carries (docs/12).
 *
 * These live in `next.config.ts`, where nothing about them is self-explaining — a later edit
 * could widen `script-src` or drop `frame-ancestors` and no other test would notice. Each
 * assertion below is a decision recorded in docs/12, not a restatement of the config.
 */
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

async function headers(): Promise<Record<string, string>> {
  const groups = await nextConfig.headers!();
  expect(groups).toHaveLength(1);
  expect(groups[0].source).toBe('/:path*'); // every page, every route handler, no exceptions
  return Object.fromEntries(groups[0].headers.map((h) => [h.key.toLowerCase(), h.value]));
}

function csp(all: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    all['content-security-policy']
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values.join(' ')];
      }),
  );
}

describe('security headers', () => {
  it('locks down framing, plugins, base and form targets', async () => {
    const all = await headers();
    const directives = csp(all);
    expect(directives['frame-ancestors']).toBe("'none'"); // clickjacking
    expect(all['x-frame-options']).toBe('DENY'); // same, for browsers without frame-ancestors
    expect(directives['object-src']).toBe("'none'");
    expect(directives['base-uri']).toBe("'self'"); // no injected <base> redirecting relative URLs
    expect(directives['form-action']).toBe("'self'"); // the enquiry form cannot be retargeted
  });

  it('allows only the origins the site actually loads from', async () => {
    const directives = csp(await headers());
    expect(directives['default-src']).toBe("'self'");
    // Photos: the optimizer serves same-origin, but the blur placeholder is a data: URI and the
    // Blob host is listed because an unoptimized <img> would fetch it directly.
    expect(directives['img-src']).toContain('https://*.public.blob.vercel-storage.com');
    expect(directives['img-src']).toContain('data:');
    expect(directives['font-src']).toBe("'self'"); // next/font self-hosts DM Sans
    // Sentry's ingest is the only cross-origin request the browser makes; Vercel Analytics posts
    // to /_vercel/insights on this origin.
    expect(directives['connect-src']).toBe("'self' https://*.sentry.io");
    expect(directives['frame-src']).toBe("'none'");
  });

  it("keeps 'unsafe-eval' out of the shipped policy", async () => {
    // `next dev` needs it for React Refresh; nothing in a production build does, and the switch
    // is on NODE_ENV === 'development' so a test run reads the policy the site actually serves.
    const directives = csp(await headers());
    expect(directives['script-src']).not.toContain("'unsafe-eval'");
    expect(directives['script-src']).toBe("'self' 'unsafe-inline'");
    expect(directives['style-src']).toBe("'self' 'unsafe-inline'");
  });

  it('sets the non-CSP headers', async () => {
    const all = await headers();
    expect(all['x-content-type-options']).toBe('nosniff');
    expect(all['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(all['cross-origin-opener-policy']).toBe('same-origin');
    expect(all['permissions-policy']).toContain('geolocation=()');
  });

  it('leaves HSTS to the platform and hides the framework banner', async () => {
    // Vercel already sends `Strict-Transport-Security: max-age=63072000; includeSubDomains;
    // preload` on every response (verified on production in H4). Setting it here too would
    // append a second, identical header rather than a stronger one.
    const all = await headers();
    expect(all['strict-transport-security']).toBeUndefined();
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
