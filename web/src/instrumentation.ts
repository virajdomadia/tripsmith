import * as Sentry from '@sentry/nextjs';

// Next.js instrumentation hook: loads the runtime-specific Sentry init once per server start.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

// Server Component / route handler errors (including the ones Next renders as 500s).
export const onRequestError = Sentry.captureRequestError;
