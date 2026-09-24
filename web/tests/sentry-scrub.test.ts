import { describe, expect, it } from 'vitest';
import { makeScrubber, scrubEvent, secretValues } from '../src/lib/sentry-scrub';

describe('scrubEvent', () => {
  it('drops the internal secret, visitor address and cookies, case-insensitively', () => {
    const event = scrubEvent({
      request: {
        headers: {
          'X-Internal-Secret': 's',
          'x-client-ip': '203.0.113.7',
          Cookie: 'ts_session=t',
          'X-Forwarded-For': '203.0.113.7',
          'X-Real-IP': '203.0.113.7',
          Authorization: 'Bearer t',
          accept: 'text/html',
        },
        cookies: { ts_session: 't' },
        env: { REMOTE_ADDR: '203.0.113.7', SERVER_NAME: 'web' },
      },
      user: { ip_address: '203.0.113.7' },
    });
    expect(event.request?.headers).toEqual({ accept: 'text/html' });
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.env).toEqual({ SERVER_NAME: 'web' });
    expect(event.user).toEqual({});
  });

  it('leaves an event with no request alone', () => {
    expect(scrubEvent({ type: 'transaction', request: undefined })).toEqual({ type: 'transaction' });
  });
});

describe('makeScrubber', () => {
  const scrub = makeScrubber({
    REVALIDATE_SECRET: 'rv-secret-value-123',
    NEXT_PUBLIC_SITE_KEY: 'public-value-kept',
    API_URL: 'https://api.example.test',
  });

  it('masks a secret value anywhere in the event, keys included', () => {
    const event = scrub({
      message: 'failed with rv-secret-value-123',
      exception: { values: [{ value: 'header was rv-secret-value-123' }] },
      breadcrumbs: [{ message: 'fetch', data: { note: 'x rv-secret-value-123 y' } }],
      extra: { 'rv-secret-value-123': 'as a key', kept: 'https://api.example.test' },
      contexts: { hop: { secret: ['rv-secret-value-123'] } },
    } as Record<string, unknown>);
    expect(JSON.stringify(event)).not.toContain('rv-secret-value-123');
    expect(event.message).toBe('[Filtered]');
    expect(event.extra).toEqual({ '[Filtered]': 'as a key', kept: 'https://api.example.test' });
  });

  it('masks a truncated copy but not ordinary text', () => {
    const out = scrub({
      extra: {
        dots: 'trimmed rv-secret-v...',
        ellipsis: 'trimmed rv-secret-v\u2026 more',
        end: 'ends rv-secre',
        short: 'rv-secr...',
        plain: 'an ordinary rv-secret mention elsewhere',
      },
    } as Record<string, unknown>);
    expect(out.extra).toEqual({
      dots: '[Filtered]',
      ellipsis: '[Filtered]',
      end: '[Filtered]',
      short: 'rv-secr...',
      plain: 'an ordinary rv-secret mention elsewhere',
    });
  });

  it('only treats server secrets as secrets', () => {
    expect(
      secretValues({
        REVALIDATE_SECRET: 'rv-secret-value-123',
        BLOB_READ_WRITE_TOKEN: 'token-value-123',
        NEXT_PUBLIC_SITE_KEY: 'public-value-kept',
        SHORT_SECRET: 'short',
        API_URL: 'https://api.example.test',
      }),
    ).toEqual(['rv-secret-value-123', 'token-value-123']);
  });
});
