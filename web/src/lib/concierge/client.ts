/**
 * One concierge turn from the browser (v3 C2): `POST {api}/chat`, straight to the api's domain —
 * not through the web's `/api` rewrite, which hides the visitor's address from the per-IP limit
 * and may buffer the stream (03-requirements-v3, decisions table). CORS on the api allows the
 * web origin; the CSP's `connect-src` allows the api origin (next.config.ts).
 *
 * Every outcome becomes reducer actions, so this never throws: a refusal before the stream opens
 * (`429 { reason }`, `503 ai_off`, `404`) is `refused`; a network failure is `failed`.
 */

import { parseErrorEnvelope } from '@/lib/api-errors';
import type { Action } from './reducer';
import { readSse } from './sse';
import type { LimitReason } from './types';

const LIMIT_REASONS: readonly LimitReason[] = [
  'conversation_full',
  'ip_limit',
  'daily_cap',
  'monthly_cap',
  'ai_off',
];

export const OFFLINE =
  'Couldn’t reach the concierge. Check your connection and try again, or tap “Talk to a person”.';

export async function streamChat({
  apiUrl,
  conversationId,
  message,
  dispatch,
  signal,
}: {
  apiUrl: string;
  conversationId: string | null;
  message: string;
  dispatch: (action: Action) => void;
  signal?: AbortSignal;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(conversationId ? { message, conversationId } : { message }),
      signal,
      cache: 'no-store',
    });
  } catch {
    if (!signal?.aborted) dispatch({ type: 'failed', message: OFFLINE });
    return;
  }

  if (!response.ok || !response.body) {
    const envelope = parseErrorEnvelope(await response.json().catch(() => null));
    const reason = envelope?.error.reason as LimitReason | undefined;
    const message = envelope?.error.message ?? OFFLINE;
    if (response.status === 404) {
      dispatch({ type: 'refused', reason: 'ended', message });
    } else if (reason && LIMIT_REASONS.includes(reason)) {
      dispatch({ type: 'refused', reason, message });
    } else {
      dispatch({ type: 'failed', message });
    }
    return;
  }

  const started = response.headers.get('x-conversation-id');
  if (started) dispatch({ type: 'started', conversationId: started });

  let ended = false;
  try {
    for await (const frame of readSse(response.body)) {
      let data: unknown = null;
      try {
        data = JSON.parse(frame.data);
      } catch {
        continue;
      }
      dispatch({ type: 'event', event: frame.event, data });
      if (frame.event === 'done' || frame.event === 'error') ended = true;
    }
  } catch {
    // The connection dropped mid-answer (or the visitor closed the chat): keep what arrived.
  }
  if (!ended && !signal?.aborted) {
    dispatch({ type: 'failed', message: 'The answer was cut off. Try asking again.' });
  }
}
