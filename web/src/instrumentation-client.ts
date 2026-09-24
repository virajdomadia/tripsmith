import { loadSentry } from '@/lib/sentry-browser';

/*
 * Browser Sentry, deferred (v1.0.1). A static `import * as Sentry from '@sentry/nextjs'` here put
 * the whole browser SDK — ~58 kB gzipped, ~190 kB of JavaScript to parse — into the root chunk
 * every page hydrates, and it was the largest share of the home page's Total Blocking Time. Its
 * tracing half cannot be tree-shaken under Turbopack (`__SENTRY_TRACING__` defines only drop the
 * call, not the module), so the SDK loads as its own chunk once the page is idle instead
 * (lib/sentry-browser). Trade-off: an error thrown before that moment is not reported; a render
 * error that takes the page down still is — global-error.tsx loads and initialises it itself.
 */
const start = () => void loadSentry();

// Safari has no requestIdleCallback; a short timeout after `load` is the same idea.
const whenIdle = (fn: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1);

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  if (document.readyState === 'complete') whenIdle(start);
  else window.addEventListener('load', () => whenIdle(start), { once: true });
}
