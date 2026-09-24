import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry';
import { scrubEvent } from '@/lib/sentry-scrub';

Sentry.init({
  ...sentryOptions(process.env),
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
});
