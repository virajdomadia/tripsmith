import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// Trailing slash stripped: `${API_URL}/:path*` would otherwise proxy to `//health`, which the api 404s.
const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      // scripts/seed.py --local (any port: `--local-base-url` lets a worktree api run beside :8000)
      { protocol: 'http', hostname: 'localhost' },
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
