import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/env';

describe('parseEnv', () => {
  it('treats empty-string vars as unset (the KEY= convention in .env.example)', () => {
    const env = parseEnv({ DATABASE_URL: '', SENTRY_DSN: '', WEB_URL: '', PORT: '' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.WEB_URL).toBe('http://localhost:3000');
    expect(env.PORT).toBe(8787);
  });
  it('falls back to a dev secret outside production', () => {
    expect(parseEnv({}).REVALIDATE_SECRET).toBe('dev-secret');
  });
  it('requires REVALIDATE_SECRET in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/REVALIDATE_SECRET/);
    expect(() => parseEnv({ NODE_ENV: 'production', REVALIDATE_SECRET: 'dev-secret' })).toThrow(
      /REVALIDATE_SECRET/,
    );
    expect(
      parseEnv({ NODE_ENV: 'production', REVALIDATE_SECRET: 'a'.repeat(32) }).REVALIDATE_SECRET,
    ).toBe('a'.repeat(32));
  });
});
