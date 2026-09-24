/**
 * v1.0.1: the browser SDK is loaded on demand. Whoever asks first (the idle-time start or
 * global-error) triggers one download and one init, and a capture never runs before that init.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('@/lib/sentry-sdk', () => ({
  init: vi.fn(() => calls.push('init')),
  captureException: vi.fn(() => calls.push('capture')),
}));

afterEach(() => {
  calls.length = 0;
});

describe('loadSentry', () => {
  it('initialises once, before any capture, however many callers race', async () => {
    const { loadSentry } = await import('../src/lib/sentry-browser');
    const [a, b] = await Promise.all([loadSentry(), loadSentry()]);
    expect(a).toBe(b);
    (await loadSentry()).captureException(new Error('boom'));
    expect(calls).toEqual(['init', 'capture']);
  });

  it('initialises the browser as errors only', async () => {
    const sdk = await import('@/lib/sentry-sdk');
    const { loadSentry } = await import('../src/lib/sentry-browser');
    await loadSentry();
    const options = vi.mocked(sdk.init).mock.calls[0][0] as Record<string, unknown>;
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).toHaveProperty('integrations');
  });
});
