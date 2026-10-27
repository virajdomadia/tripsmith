import type { components } from './api-types';

/**
 * The api's error envelope, parsed without trusting it — shared by the server client (`api.ts`)
 * and client components (no `next/headers` here, so the browser bundle can import it).
 *
 * P19: a hand-written guard, not a zod schema. Client components on the package page import this
 * module, and zod came with it — ~90 kB on the page's first load, for one small object.
 */

export type ErrorCode = components['schemas']['ErrorCode'];
export type ApiErrorResponse = components['schemas']['ApiErrorResponse'];
/** OP-10: every machine-readable cause the api sends (`ErrorReason` in api/app/schemas/errors.py). */
export type ErrorReason = components['schemas']['ErrorReason'];

/** Every code the contract defines (`tests/api.test.ts` fails if one is added or dropped). */
export const ERROR_CODES = [
  'validation',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'conflict',
  'internal',
] as const satisfies readonly ErrorCode[];

const isCode = (v: unknown): v is ErrorCode =>
  typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v);

const isStringRecord = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'string');

/**
 * Every non-2xx response from the api: `{ error: { code, message, fieldErrors?, reason? } }`
 * (`fieldErrors` only for `validation`; `reason`, an `ErrorReason`, mostly on 409s).
 * Returns a fresh object with only those keys (a null optional reads as absent), or null when
 * `raw` isn't one.
 */
export function parseErrorEnvelope(raw: unknown): ApiErrorResponse | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e: unknown = (raw as { error?: unknown }).error;
  if (typeof e !== 'object' || e === null) return null;
  const { code, message, fieldErrors, reason } = e as Record<string, unknown>;
  if (!isCode(code) || typeof message !== 'string') return null;
  if (fieldErrors != null && !isStringRecord(fieldErrors)) return null;
  if (reason != null && typeof reason !== 'string') return null;
  return {
    error: {
      code,
      message,
      ...(fieldErrors != null && { fieldErrors }),
      // The contract types the value; a string the api adds later only fails the web's checks.
      ...(reason != null && { reason: reason as ErrorReason }),
    },
  };
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorResponse['error'],
  ) {
    super(body.message);
  }
}

/**
 * Build the error for a non-2xx response. Only a body matching the api envelope is trusted;
 * anything else (a gateway's own JSON, an empty body) becomes a generic `internal` error that
 * still carries the real HTTP status.
 */
export function errorFromResponse(status: number, statusText: string, raw: unknown) {
  const parsed = parseErrorEnvelope(raw);
  if (parsed) return new ApiRequestError(status, parsed.error);
  return new ApiRequestError(status, { code: 'internal', message: statusText || `HTTP ${status}` });
}
