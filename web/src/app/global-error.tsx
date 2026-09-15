'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Root-layout render errors bypass every other boundary; report them, then show the bare minimum.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
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
