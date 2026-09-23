import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// Trailing slash stripped: `${API_URL}/:path*` would otherwise proxy to `//health`, which the api 404s.
const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  images: {
    // Without this, Vercel's optimizer inherits the upstream `Cache-Control` of a file served
    // from `public/` — `max-age=0, must-revalidate` — so every visit revalidates the optimized
    // hero before it can paint (a 605 ms round trip on Slow 4G, measured in H2). A day is long
    // enough to cover a session and short enough that a redeployed photo at the same path
    // (`/_next/image?url=/home/hero.jpg&…` is stable across deploys) settles within a day.
    minimumCacheTTL: 60 * 60 * 24,
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      // scripts/seed.py --local (any port: `--local-base-url` lets a worktree api run beside
      // :8000) — dev-only: never allow a `localhost` image source in the prod allow-list.
      ...(process.env.VERCEL ? [] : [{ protocol: 'http' as const, hostname: 'localhost' }]),
    ],
  },
  // The OG card (F13) reads DM Sans from disk at runtime; tracing missed the TTFs for one of the
  // two image routes, so ship them explicitly (keys are picomatch `contains` on the route path).
  outputFileTracingIncludes: { 'opengraph-image*': ['./src/lib/og/fonts/*.ttf'] },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

// Runtime error capture only: no source-map upload (no SENTRY_AUTH_TOKEN in CI yet), no telemetry.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
});
