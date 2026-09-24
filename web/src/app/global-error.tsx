'use client';

import { useEffect } from 'react';
import { loadSentry } from '@/lib/sentry-browser';

// Root-layout render errors bypass every other boundary; report them, then show the bare minimum.
// The SDK is loaded (and initialised, if the idle-time start has not run yet) on demand, never
// statically imported: this boundary ships with every page (lib/sentry-browser).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    void loadSentry().then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body>
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>
      </body>
    </html>
  );
}
