import type { ApiErrorResponse } from '@tripsmith/shared';

type Code = ApiErrorResponse['error']['code'];

/** `fieldErrors` key for validation issues that belong to the whole object rather than one field. */
export const ROOT_FIELD = '_root';

const STATUS: Record<Code, 400 | 401 | 403 | 404 | 409 | 429 | 500> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  constructor(
    public code: Code,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
  body(): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      },
    };
  }
}
