import { api, ApiRequestError, type GetResponse } from '@/lib/api';

export type SessionInfo = GetResponse<'/auth/session'>;

/** The signed-in owner for a server component, or `null` when the api says 401. Other errors throw. */
export async function getSession(): Promise<SessionInfo | null> {
  try {
    return await api('/auth/session', { auth: true });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) return null;
    throw e;
  }
}
