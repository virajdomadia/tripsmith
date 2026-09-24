'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect } from 'react';
import { Container } from '@/components/site/Container';
import { BUSINESS } from '@/lib/business';

/**
 * Render errors on any public page — most often the api timing out or down. Sits inside the site
 * layout, so the header and footer stay put and the visitor keeps a way to reach a person.
 * Reports the same way `global-error.tsx` does.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  // `reset()` alone re-renders on the client only; a failed server fetch needs the refresh too.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <Container className="grid justify-items-center gap-3.5 py-24 text-center">
      <p className="label-caps">Something went wrong</p>
      <h1 className="text-4xl">We couldn’t load this page</h1>
      <p className="max-w-[44ch] text-mute">
        It is on our side, not yours. Try again in a moment — or call{' '}
        <a href={BUSINESS.phoneHref} className="num whitespace-nowrap">
          {BUSINESS.phoneDisplay}
        </a>{' '}
        and a person will help, {BUSINESS.hours}.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={retry}
          className="rounded-btn bg-action px-5 py-3 font-bold text-ink transition-colors hover:bg-action-ink"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-btn border border-line px-5 py-3 font-bold text-ink no-underline hover:border-ink"
        >
          Back to home
        </Link>
      </div>
      {error.digest && <p className="num text-xs text-mute">Reference {error.digest}</p>}
    </Container>
  );
}
