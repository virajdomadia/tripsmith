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
  /** Browser only (V4): URLs without their query strings. */
  beforeSend?: typeof stripQueryStrings;
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
      ? { integrations: withoutTracing, beforeSend: stripQueryStrings }
      : { tracesSampleRate: environment === 'development' ? 1 : 0.1 }),
    debug: env.SENTRY_DEBUG === '1', // SDK logs every envelope it sends — for verifying delivery
  };
}

/** Sentry's `integrations` callback: the defaults minus BrowserTracing. */
export function withoutTracing<T extends { name: string }>(defaults: T[]): T[] {
  return defaults.filter((integration) => integration.name !== 'BrowserTracing');
}

/** Everything from the first `?` or `#` on: a URL's query string and fragment. */
const QUERY = /[?#].*$/s;
const BREADCRUMB_URLS = ['url', 'from', 'to'] as const;

type Strippable = {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string> };
  breadcrumbs?: { data?: Record<string, unknown> }[];
};

/**
 * The browser's `beforeSend` (V4, OP-4). A page URL can carry an email, a booking ref or a
 * signed token (`?email=…`, a voucher link's `?exp=…&sig=…`), and the SDK copies URLs into the
 * request, the Referer and every navigation and fetch breadcrumb. Each loses its query string
 * and fragment; the path stays, so the issue still says which page broke.
 */
export function stripQueryStrings<E extends Strippable>(event: E): E {
  const request = event.request;
  if (request) {
    if (typeof request.url === 'string') request.url = request.url.replace(QUERY, '');
    delete request.query_string;
    const headers = request.headers;
    if (headers) {
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'referer')
          headers[name] = String(headers[name]).replace(QUERY, '');
      }
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    const data = crumb.data;
    if (!data) continue;
    for (const key of BREADCRUMB_URLS) {
      const value = data[key];
      if (typeof value === 'string') data[key] = value.replace(QUERY, '');
    }
  }
  return event;
}
