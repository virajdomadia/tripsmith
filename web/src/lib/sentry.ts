/**
 * One set of Sentry options for the client, server and edge inits (docs/04 §10).
 * Pure so it can be unit-tested; the three init files just spread it.
 */

/** The subset of `process.env` we read (typed loosely so `process.env` itself is accepted). */
export type SentryEnv = Partial<
  Record<
    | 'SENTRY_DSN'
    | 'NEXT_PUBLIC_SENTRY_DSN'
    | 'VERCEL_ENV'
    | 'NEXT_PUBLIC_VERCEL_ENV'
    | 'VERCEL_GIT_COMMIT_SHA'
    | 'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA'
    | 'SENTRY_DEBUG',
    string
  >
> &
  Record<string, string | undefined>;

export type SentryOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  release?: string;
  sendDefaultPii: false;
  /** Server and edge only. */
  tracesSampleRate?: number;
  /** Browser only. */
  integrations?: typeof withoutTracing;
  debug: boolean;
};

/**
 * `runtime` decides tracing. Server and edge keep a light sample of performance traces. The
 * browser is errors only (v1.0.1): no `tracesSampleRate`, and the BrowserTracing default
 * integration is dropped, so nothing patches fetch/XHR or watches long animation frames on the
 * visitor's main thread. (The SDK is also loaded after the page is idle — instrumentation-client.)
 */
export function sentryOptions(
  env: SentryEnv,
  runtime: 'server' | 'browser' = 'server',
): SentryOptions {
  const dsn = env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN || undefined;
  // Vercel exposes both spellings; only the NEXT_PUBLIC_ ones reach the browser bundle.
  const environment = env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV || 'development';
  const release = env.VERCEL_GIT_COMMIT_SHA || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    // Only when known: `release: undefined` would override the build-time release that
    // withSentryConfig injects into the client bundle.
    ...(release ? { release } : {}),
    sendDefaultPii: false,
    ...(runtime === 'browser'
      ? { integrations: withoutTracing }
      : { tracesSampleRate: environment === 'development' ? 1 : 0.1 }),
    debug: env.SENTRY_DEBUG === '1', // SDK logs every envelope it sends — for verifying delivery
  };
}

/** Sentry's `integrations` callback: the defaults minus BrowserTracing. */
export function withoutTracing<T extends { name: string }>(defaults: T[]): T[] {
  return defaults.filter((integration) => integration.name !== 'BrowserTracing');
}
