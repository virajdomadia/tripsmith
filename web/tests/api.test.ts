import { describe, expect, it } from 'vitest';
import { ApiRequestError, errorFromResponse } from '../src/lib/api';

describe('errorFromResponse', () => {
  it('uses the api envelope when the body is one', () => {
    const err = errorFromResponse(400, 'Bad Request', {
      error: { code: 'validation', message: 'Invalid request', fieldErrors: { month: 'bad' } },
    });
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(400);
    expect(err.body).toEqual({
      code: 'validation',
      message: 'Invalid request',
      fieldErrors: { month: 'bad' },
    });
    expect(err.message).toBe('Invalid request');
  });
  it('falls back to a generic envelope for non-envelope JSON (a gateway 502)', () => {
    const err = errorFromResponse(502, 'Bad Gateway', { message: 'upstream down' });
    expect(err.status).toBe(502);
    expect(err.body).toEqual({ code: 'internal', message: 'Bad Gateway' });
  });
  it('falls back when the body is null or absent', () => {
    expect(errorFromResponse(503, '', null).body).toEqual({
      code: 'internal',
      message: 'HTTP 503',
    });
    expect(errorFromResponse(503, '', undefined).body.message).toBe('HTTP 503');
  });
});
