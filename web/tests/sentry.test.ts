import { describe, expect, it } from 'vitest';
import { sentryOptions } from '../src/lib/sentry';

describe('sentryOptions', () => {
  it('is disabled without a DSN', () => {
    expect(sentryOptions({})).toMatchObject({ enabled: false, dsn: undefined });
  });

  it('server/edge use SENTRY_DSN, falling back to the public one', () => {
    expect(sentryOptions({ SENTRY_DSN: 'https://a@o1.ingest.sentry.io/1' })).toMatchObject({
      enabled: true,
      dsn: 'https://a@o1.ingest.sentry.io/1',
    });
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: 'https://b@o1.ingest.sentry.io/1' }).dsn).toBe(
      'https://b@o1.ingest.sentry.io/1',
    );
  });

  it('environment and release come from Vercel, defaulting to development', () => {
    expect(sentryOptions({ SENTRY_DSN: 'x' })).toMatchObject({ environment: 'development' });
    expect(
      sentryOptions({ SENTRY_DSN: 'x', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'abc' }),
    ).toMatchObject({ environment: 'preview', release: 'abc' });
  });

  it('never sends PII and samples traces lightly outside development', () => {
    const prod = sentryOptions({ SENTRY_DSN: 'x', VERCEL_ENV: 'production' });
    expect(prod.sendDefaultPii).toBe(false);
    expect(prod.tracesSampleRate).toBe(0.1);
    expect(sentryOptions({ SENTRY_DSN: 'x' }).tracesSampleRate).toBe(1);
  });
});

describe('sentryOptions debug switch', () => {
  it('SENTRY_DEBUG=1 turns on SDK logging, otherwise off', () => {
    expect(sentryOptions({ SENTRY_DSN: 'x' }).debug).toBe(false);
    expect(sentryOptions({ SENTRY_DSN: 'x', SENTRY_DEBUG: '1' }).debug).toBe(true);
  });
});
