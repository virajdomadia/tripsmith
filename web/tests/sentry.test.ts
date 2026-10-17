import { describe, expect, it } from 'vitest';
import { sentryOptions, stripQueryStrings, withoutTracing } from '../src/lib/sentry';

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

  it('the browser gets the same environment/release via the NEXT_PUBLIC_ mirrors', () => {
    expect(
      sentryOptions({
        NEXT_PUBLIC_SENTRY_DSN: 'x',
        NEXT_PUBLIC_VERCEL_ENV: 'production',
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: 'def',
      }),
    ).toMatchObject({ environment: 'production', release: 'def' });
  });

  it('omits release when unknown so the build-time release injected by withSentryConfig wins', () => {
    expect('release' in sentryOptions({ SENTRY_DSN: 'x' })).toBe(false);
  });

  it('never sends PII and samples server traces lightly outside development', () => {
    const prod = sentryOptions({ SENTRY_DSN: 'x', VERCEL_ENV: 'production' });
    expect(prod.sendDefaultPii).toBe(false);
    expect(prod.tracesSampleRate).toBe(0.1);
    expect(sentryOptions({ SENTRY_DSN: 'x' }).tracesSampleRate).toBe(1);
  });

  it('the browser is errors only: no trace sampling and no BrowserTracing integration', () => {
    const browser = sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: 'x' }, 'browser');
    expect('tracesSampleRate' in browser).toBe(false);
    expect(browser.integrations).toBe(withoutTracing);
    const defaults = [{ name: 'Breadcrumbs' }, { name: 'BrowserTracing' }, { name: 'Dedupe' }];
    expect(withoutTracing(defaults).map((i) => i.name)).toEqual(['Breadcrumbs', 'Dedupe']);
  });
});

describe('sentryOptions debug switch', () => {
  it('SENTRY_DEBUG=1 turns on SDK logging, otherwise off', () => {
    expect(sentryOptions({ SENTRY_DSN: 'x' }).debug).toBe(false);
    expect(sentryOptions({ SENTRY_DSN: 'x', SENTRY_DEBUG: '1' }).debug).toBe(true);
  });
});

describe('the browser beforeSend (V4, OP-4)', () => {
  // A page URL can carry a booking ref, an email or a signed token (?date=…&email=…, a voucher
  // link's ?exp=…&sig=…); none of it belongs in an error report.
  const browser = sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: 'x' }, 'browser');

  it('is set for the browser only', () => {
    expect(browser.beforeSend).toBe(stripQueryStrings);
    expect('beforeSend' in sentryOptions({ SENTRY_DSN: 'x' })).toBe(false);
  });

  it('strips query strings and fragments from the request and every breadcrumb', () => {
    const event = {
      request: {
        url: 'https://tripsmith.virajdomadia.com/account/bookings/TB-ABC123?sig=deadbeef#pack',
        query_string: 'sig=deadbeef',
        headers: { Referer: 'https://tripsmith.virajdomadia.com/login?email=priya%40customer.in' },
      },
      breadcrumbs: [
        { category: 'navigation', data: { from: '/packages/kasol?date=2026-11-07', to: '/x?a=1' } },
        { category: 'fetch', data: { url: '/api/bookings/TB-ABC123/voucher.pdf?exp=1&sig=ff' } },
        { category: 'ui.click', message: 'button.pay' },
      ],
    };
    const out = stripQueryStrings(event);
    expect(out.request).toEqual({
      url: 'https://tripsmith.virajdomadia.com/account/bookings/TB-ABC123',
      headers: { Referer: 'https://tripsmith.virajdomadia.com/login' },
    });
    expect(out.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: '/packages/kasol', to: '/x' } },
      { category: 'fetch', data: { url: '/api/bookings/TB-ABC123/voucher.pdf' } },
      { category: 'ui.click', message: 'button.pay' },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/sig=|email=|date=|exp=/);
  });

  it('leaves an event without a request or breadcrumbs alone', () => {
    const plain = { message: 'boom', breadcrumbs: [] };
    expect(stripQueryStrings(plain)).toEqual({ message: 'boom', breadcrumbs: [] });
  });
});
