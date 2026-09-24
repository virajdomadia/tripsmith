import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';
import { makeScrubber } from '@/lib/sentry-scrub';

// REVALIDATE_SECRET named explicitly: the edge runtime only sees env vars the code references.
const scrub = makeScrubber({ ...process.env, REVALIDATE_SECRET: process.env.REVALIDATE_SECRET });

Sentry.init({
  ...sentryOptions(process.env),
  beforeSend: scrub,
  beforeSendTransaction: scrub,
});
