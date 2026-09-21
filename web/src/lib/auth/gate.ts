import { SESSION_COOKIE } from './cookie';

/**
 * Pure decisions behind `middleware.ts` and the auth route handlers. The gate is UX only —
 * the api enforces `require_owner` on every `/admin/*` endpoint (05 §Auth).
 */

export const ADMIN_HOME = '/admin';
export const LOGIN_PATH = '/admin/login';

export type LoginError = 'credentials' | 'rate_limited' | 'unavailable';

/** A post-login target: an in-site `/admin…` path or the dashboard. Never an open redirect. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/admin') || raw.startsWith('//')) return ADMIN_HOME;
  const path = raw.split('?')[0];
  if (path !== '/admin' && !path.startsWith('/admin/')) return ADMIN_HOME;
  if (path === LOGIN_PATH) return ADMIN_HOME;
  return raw;
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

export type Gate = { kind: 'allow' } | { kind: 'login'; next: string } | { kind: 'home' };

export function gateDecision(pathWithSearch: string, signedIn: boolean): Gate {
  const path = pathWithSearch.split('?')[0];
  const isForm = path === LOGIN_PATH;
  if (isForm) return signedIn ? { kind: 'home' } : { kind: 'allow' };
  return signedIn ? { kind: 'allow' } : { kind: 'login', next: safeNext(pathWithSearch) };
}

export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
}
