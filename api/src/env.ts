import { z } from 'zod';

const schema = z
  .object({
    DATABASE_URL: z.string().url().optional(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    /** Next.js app origin; the api POSTs on-demand revalidation here. */
    WEB_URL: z.string().url().default('http://localhost:3000'),
    /** Public site origin used when building absolute URLs (local uploads, canonical links). */
    SITE_URL: z.string().url().default('http://localhost:3000'),
    REVALIDATE_SECRET: z.string().default('dev-secret'),
    SENTRY_DSN: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(8787),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    if (
      e.NODE_ENV === 'production' &&
      (e.REVALIDATE_SECRET === 'dev-secret' || e.REVALIDATE_SECRET.length < 32)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['REVALIDATE_SECRET'],
        message: 'REVALIDATE_SECRET must be set to a random value (>= 32 chars) in production',
      });
    }
  });

export type Env = z.infer<typeof schema>;

/** `KEY=` in a .env file means "unset", not "empty string" — strip those before validating. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
