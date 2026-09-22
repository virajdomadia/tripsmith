import type { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { loginHref, safeNext } from '@/lib/auth/gate';
import { ApiRequestError } from '@/lib/api-errors';

type Router = ReturnType<typeof useRouter>;

/**
 * A mid-session write can 401 once the owner's cookie has expired. Toasting `e.body.message`
 * ("Sign in to continue") there just leaves them stuck on a dead form — a fresh navigation to
 * the same page would have been bounced to the login screen by `middleware.ts`, so an expired
 * write should land in the same place instead of a confusing error. Any other api error, or a
 * non-api failure, still just toasts.
 */
export function reportAdminError(
  e: unknown,
  opts: { router: Router; pathname: string; fallback: string },
): void {
  if (e instanceof ApiRequestError && e.status === 401) {
    toast.error('Your session expired — sign in again');
    opts.router.push(loginHref({ next: safeNext(opts.pathname) }));
    return;
  }
  if (e instanceof ApiRequestError) {
    toast.error(e.body.message);
    return;
  }
  toast.error(opts.fallback);
}
