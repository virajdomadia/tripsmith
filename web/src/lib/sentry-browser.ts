import { sentryOptions } from '@/lib/sentry';

type SentryModule = typeof import('@/lib/sentry-sdk');

let loading: Promise<SentryModule> | undefined;

/**
 * The browser SDK, loaded on demand and initialised exactly once (v1.0.1). A static
 * `import '@sentry/nextjs'` anywhere in client code puts the whole SDK (~58 kB gzipped) back into
 * the chunks every page downloads, so every client caller — the idle-time start in
 * instrumentation-client.ts and global-error.tsx — goes through this promise instead. Whoever
 * comes first triggers the download and the init; the capture always runs after init.
 *
 * Only NEXT_PUBLIC_* reaches the client, and Next inlines them one by one, so each is read
 * explicitly (no `process.env` spread on the client).
 */
export function loadSentry(): Promise<SentryModule> {
  loading ??= import('@/lib/sentry-sdk').then((Sentry) => {
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
    return Sentry;
  });
  return loading;
}
