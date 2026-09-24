import { SESSION_COOKIE } from './cookie';

/**
 * Pure decisions behind `middleware.ts` and the auth route handlers. The gate is UX only —
 * the api enforces `require_owner` on every `/admin/*` endpoint (05 §Auth).
 */

export const ADMIN_HOME = '/admin';
export const LOGIN_PATH = '/admin/login';
/** Where a signed-in customer lands instead of `/admin` (R18). Built in B8 — 404s until then. */
export const ACCOUNT_PATH = '/account';

export type LoginError = 'credentials' | 'rate_limited' | 'unavailable';

const SAFE_NEXT_PROBE = 'http://safe-next.invalid';

/**
 * A post-login target: an in-site `/admin…` path or the dashboard. Never an open redirect.
 * Resolved through the URL parser (not string prefix checks) so dot-segments and backslashes
 * are normalised away before the `/admin` scope check runs — `new URL(next, request.url)`
 * downstream would otherwise collapse `/admin/../x` to `/x`, escaping the scope.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return ADMIN_HOME;
  let url: URL;
  try {
    url = new URL(raw, SAFE_NEXT_PROBE);
  } catch {
    return ADMIN_HOME;
  }
  if (url.origin !== SAFE_NEXT_PROBE) return ADMIN_HOME; // e.g. '//evil.example/admin'
  const path = url.pathname; // dot segments + backslashes already collapsed
  if (path !== ADMIN_HOME && !path.startsWith('/admin/')) return ADMIN_HOME;
  if (path === LOGIN_PATH) return ADMIN_HOME;
  return path + url.search; // never the hash
}

export function loginHref(opts: {
  error?: LoginError;
  next?: string;
  email?: string;
  signedOut?: boolean;
}): string {
  const q = new URLSearchParams();
  if (opts.error) q.set('error', opts.error);
  if (opts.next && opts.next !== ADMIN_HOME) q.set('next', opts.next);
  if (opts.email) q.set('email', opts.email);
  if (opts.signedOut) q.set('signedout', '1');
  const s = q.toString();
  return s ? `${LOGIN_PATH}?${s}` : LOGIN_PATH;
}

/** Who the api says the cookie belongs to. `customer` is any signed-in role that isn't `owner`. */
export type Viewer = 'owner' | 'customer' | 'anonymous';

export type Gate =
  { kind: 'allow' } | { kind: 'login'; next: string } | { kind: 'home' } | { kind: 'account' };

export function gateDecision(pathWithSearch: string, viewer: Viewer): Gate {
  // Owners only (R18): a customer is validly signed in, just not here — the form included.
  if (viewer === 'customer') return { kind: 'account' };
  const signedIn = viewer === 'owner';
  const path = pathWithSearch.split('?')[0];
  const isForm = path === LOGIN_PATH;
  if (isForm) return signedIn ? { kind: 'home' } : { kind: 'allow' };
  return signedIn ? { kind: 'allow' } : { kind: 'login', next: safeNext(pathWithSearch) };
}

export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
}
