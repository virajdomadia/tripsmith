import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  SITE_URL: z.string().url().default('http://localhost:3000'),
  REVALIDATE_SECRET: z.string().default('dev-secret'),
  SENTRY_DSN: z.string().optional(),
  PORT: z.coerce.number().default(8787),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

export const env = schema.parse(process.env);
