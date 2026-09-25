import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// Trailing slash stripped: `${API_URL}/:path*` would otherwise proxy to `//health`, which the api 404s.
const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/*
 * Security headers (H4, docs/12). Everything the browser is allowed to do on this origin.
 *
 * `script-src` carries `'unsafe-inline'` rather than a nonce, and that is a deliberate trade:
 * Next's inline bootstrap (`self.__next_f.push(…)`) and the JSON-LD blocks are generated per
 * page, so the alternative is a per-request nonce from middleware — which makes every page
 * dynamic and gives up the static rendering H2 measured. What the policy still buys, with no
 * remote script origin allowed at all, is that an injected `<script src>` cannot load anything.
 * The JSON-LD payloads are escaped and covered by web/tests/jsonld-escape.test.ts.
 *
 * HSTS is absent on purpose: Vercel already sends it on every response (verified on production
 * in H4), and a second copy would be a duplicate header, not a stronger one.
 */
const isDev = process.env.NODE_ENV === 'development';

// Razorpay Checkout (B5, docs/04 v2 §5 step 6): the hosts a real test payment needed.
// checkout.js loads cdn.razorpay.com's risk-detection bundle and reports to lumberjack.
const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com https://cdn.razorpay.com';
const RAZORPAY_FRAME = 'https://api.razorpay.com';
const RAZORPAY_CONNECT = 'https://api.razorpay.com https://lumberjack.razorpay.com';

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Two iframes on the site. The keyless Google Maps embed on /contact
  // (components/site/contact/MapEmbed.tsx) — both hosts, because the
  // `maps.google.com/maps?…&output=embed` URL redirects to www.google.com and a frame navigation
  // is checked again at the redirect target. And Razorpay Checkout (B5), which draws its payment
  // window as a frame from api.razorpay.com. Site-wide, not per page: one policy to verify.
  `frame-src https://maps.google.com https://www.google.com ${RAZORPAY_FRAME}`,
  "form-action 'self'",
  // `unsafe-eval` is React Refresh; va.vercel-scripts.com is the Analytics debug script, which
  // @vercel/analytics loads only in development (production serves /_vercel/insights from here).
  // checkout.razorpay.com: Checkout.js, injected on the Pay click only (lib/razorpay-checkout.ts).
  `script-src 'self' 'unsafe-inline' ${RAZORPAY_SCRIPT}${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ''}`,
  "style-src 'self' 'unsafe-inline'", // Tailwind + Next inject <style> elements
  // Every photo goes through next/image, so it is served same-origin from /_next/image; the
  // Blob host is listed because it is the upstream that would be fetched directly if any image
  // ever bypassed the optimizer, and `data:` covers inline SVG data URIs. No `blob:`: nothing
  // in the app creates object URLs today, and the uploader posts its File straight through.
  "img-src 'self' data: https://*.public.blob.vercel-storage.com",
  "font-src 'self'", // next/font self-hosts DM Sans
  // Sentry's ingest and Razorpay (Checkout.js talks to its api from this page) are the only
  // cross-origin calls from the browser; Vercel Analytics posts to /_vercel/insights on this
  // origin. `ws:` is the dev server's HMR socket.
  `connect-src 'self' https://*.sentry.io ${RAZORPAY_CONNECT}${isDev ? ' ws:' : ''}`,
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // `-allow-popups`, not `same-origin` (B5): Razorpay Checkout opens the bank / 3-D Secure page
  // as a popup from its frame and writes into it; `same-origin` severs that popup from its opener
  // and it stays blank (seen on a real test payment). Other windows still cannot reach this one.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  {
    key: 'Permissions-Policy',
    // `interest-cohort` is deliberately absent: FLoC is gone and Chrome logs
    // "Unrecognized feature" for it on every response.
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  // The version banner tells an attacker which Next advisories to try; it buys nothing.
  poweredByHeader: false,
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
  // The site-wide card (app/opengraph-image.tsx) is prerendered, but should it ever render at
  // runtime it reads the home hero from disk as well.
  outputFileTracingIncludes: {
    'opengraph-image*': ['./src/lib/og/fonts/*.ttf', './src/assets/home/hero.jpg'],
  },
  async headers() {
    // Everything except `/api/*`, which the rewrite below hands to the api — and the api sets its
    // own headers. Matching both would send two Content-Security-Policy headers on one response,
    // which browsers enforce as the intersection: the api's `/docs` would lose its jsdelivr
    // allowance when reached through this origin.
    return [{ source: '/((?!api/).*)', headers: securityHeaders }];
  },
  async redirects() {
    // Swagger UI served through the rewrite below fetches `/openapi.json` from *this* origin,
    // which 404s, so `/api/docs` rendered an empty page. Send it to the api's own origin, where
    // the spec it loads is on the same host. Temporary: the api's public host is not final.
    return [{ source: '/api/docs', destination: `${API_URL}/docs`, permanent: false }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

// Runtime error capture only: no source-map upload (no SENTRY_AUTH_TOKEN in CI yet), no telemetry.
// The browser SDK is errors-only and lazy (src/instrumentation-client.ts), so there are no
// navigation spans for an `onRouterTransitionStart` export to start; its build warning is noise.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
  suppressOnRouterTransitionStartWarning: true,
});
