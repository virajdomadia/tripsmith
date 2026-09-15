import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';

// Browser init. Only NEXT_PUBLIC_* reaches the client, so the DSN must be the public variable.
Sentry.init(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN }));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
