import type { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { loginHref, safeNext } from '@/lib/auth/gate';
import { ApiRequestError } from '@/lib/api-errors';

type Router = ReturnType<typeof useRouter>;

/**
 * Where the owner is right now, query string included — an expired session on page 3 of a
 * filtered inbox should come back to page 3 of that inbox. Read from `window.location` at the
 * moment of the error (this only ever runs in an event handler, in the browser) rather than from
 * `useSearchParams`, which would force a Suspense boundary on every admin page that reports an
 * error. `pathname` is the fallback outside a browser.
 */
export function currentPath(pathname: string): string {
  if (typeof window === 'undefined' || window.location.pathname !== pathname) return pathname;
  return pathname + window.location.search;
}

/**
 * A mid-session write can 401 once the owner's cookie has expired. Toasting `e.body.message`
 * ("Sign in to continue") there just leaves them stuck on a dead form — a fresh navigation to
 * the same page would have been bounced to the login screen by `middleware.ts`, so an expired
 * write should land in the same place instead of a confusing error. `onSessionExpired` runs
 * first, so a form can park its unsaved values before the redirect. Any other api error, or a
 * non-api failure, still just toasts.
 */
export function reportAdminError(
  e: unknown,
  opts: { router: Router; pathname: string; fallback: string; onSessionExpired?: () => void },
): void {
  if (e instanceof ApiRequestError && e.status === 401) {
    opts.onSessionExpired?.();
    toast.error('Your session expired — sign in again');
    opts.router.push(loginHref({ next: safeNext(currentPath(opts.pathname)) }));
    return;
  }
  if (e instanceof ApiRequestError) {
    toast.error(e.body.message);
    return;
  }
  toast.error(opts.fallback);
}
