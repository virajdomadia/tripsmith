import { z } from 'zod';
import type { components } from './api-types';

/**
 * The api's error envelope, parsed without trusting it — shared by the server client (`api.ts`)
 * and client components (no `next/headers` here, so the browser bundle can import it).
 */

export type ErrorCode = components['schemas']['ErrorCode'];
export type ApiErrorResponse = components['schemas']['ApiErrorResponse'];

/** Every non-2xx response from the api. `fieldErrors` is present only for `validation`. */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum([
      'validation',
      'unauthorized',
      'forbidden',
      'not_found',
      'rate_limited',
      'conflict',
      'internal',
    ]),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
    reason: z.string().optional(), // some 409s: a booking's `on_request` / `too_soon` / `sold_out`
  }),
}) satisfies z.ZodType<ApiErrorResponse>; // drifts from the contract → typecheck fails

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
  const parsed = apiErrorResponseSchema.safeParse(raw);
  if (parsed.success) return new ApiRequestError(status, parsed.data.error);
  return new ApiRequestError(status, { code: 'internal', message: statusText || `HTTP ${status}` });
}
