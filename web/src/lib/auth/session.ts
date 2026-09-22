import { cache } from 'react';
import { api, ApiRequestError, type GetResponse } from '@/lib/api';

export type SessionInfo = GetResponse<'/auth/session'>;

/** The signed-in owner for a server component, or `null` when the api says 401. Other errors
 *  throw. Wrapped in React's request-scoped `cache()` so the shell layout and page both calling
 *  this within one render share a single `GET /auth/session` instead of firing it twice
 *  (the api call itself is `cache: 'no-store'`, so Next won't dedupe it for us). */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  try {
    return await api('/auth/session', { auth: true });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) return null;
    throw e;
  }
});
