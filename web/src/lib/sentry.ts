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
    | 'VERCEL_GIT_COMMIT_SHA'
    | 'SENTRY_DEBUG',
    string
  >
> &
  Record<string, string | undefined>;

export function sentryOptions(env: SentryEnv) {
  const dsn = env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN || undefined;
  const environment = env.VERCEL_ENV ?? 'development';
  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    release: env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: environment === 'development' ? 1 : 0.1,
    debug: env.SENTRY_DEBUG === '1', // SDK logs every envelope it sends — for verifying delivery
  };
}
