import { describe, expect, it } from 'vitest';
import { scrubEvent } from '../src/lib/sentry-scrub';

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
