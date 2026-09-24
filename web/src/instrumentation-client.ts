import { sentryOptions } from '@/lib/sentry';

/*
 * Browser init, deferred (v1.0.1). A static `import * as Sentry from '@sentry/nextjs'` here put
 * the whole browser SDK — ~58 kB gzipped, ~190 kB of JavaScript to parse — into the root chunk
 * every page hydrates, and it was the largest share of the home page's Total Blocking Time. Its
 * tracing half cannot be tree-shaken under Turbopack (`__SENTRY_TRACING__` defines only drop the
 * call, not the module), so the SDK loads as its own chunk once the page is idle instead.
 * Trade-off: an error thrown before that moment is not reported; render errors that take the
 * page down still are, by global-error.tsx.
 *
 * Only NEXT_PUBLIC_* reaches the client, and Next inlines them one by one, so each is read
 * explicitly (no `process.env` spread on the client).
 */
function startSentry() {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init(
      sentryOptions(
        {
          NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
          NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
          NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
        },
        'browser',
      ),
    );
  });
}

// Safari has no requestIdleCallback; a short timeout after `load` is the same idea.
const whenIdle = (fn: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1);

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  if (document.readyState === 'complete') whenIdle(startSentry);
  else window.addEventListener('load', () => whenIdle(startSentry), { once: true });
}
