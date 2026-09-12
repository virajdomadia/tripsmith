import { z } from 'zod';

export const apiErrorSchema = z.object({
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
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
