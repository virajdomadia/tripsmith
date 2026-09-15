import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';

// Browser init. Only NEXT_PUBLIC_* reaches the client, and Next inlines them one by one, so
// each is read explicitly (no `process.env` spread on the client).
Sentry.init(
  sentryOptions({
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  }),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
