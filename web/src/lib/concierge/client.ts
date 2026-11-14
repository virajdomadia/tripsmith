/**
 * One concierge turn from the browser (v3 C2): `POST {api}/chat`, straight to the api's domain —
 * not through the web's `/api` rewrite, which hides the visitor's address from the per-IP limit
 * and may buffer the stream (03-requirements-v3, decisions table). CORS on the api allows the
 * web origin; the CSP's `connect-src` allows the api origin (next.config.ts).
 *
 * Every outcome becomes reducer actions, so this never throws: a refusal before the stream opens
 * (`429 { reason }`, `503 ai_off`, `404`) is `refused`; anything else that ends a turn early is
 * `failed` with its kind (C6): `offline` (no connection, or the request never got through),
 * `server` (a 5xx), `slow` (nothing arrived for `stallMs`) or `cut` (the stream closed before
 * `done`). The api's own `error` event is folded by the reducer (`busy` / `server`).
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
  'Couldn’t reach the trip planner. Check your connection and try again, or tap “Talk to a person”.';
export const NO_CONNECTION =
  'You’re offline. Your message is still here — try again once you’re back online.';
export const SERVER =
  'Something went wrong on our side. Try again in a moment, or use the quick finder.';
export const SLOW =
  'The trip planner is taking too long to answer. Try again, or use the quick finder.';
export const CUT = 'The answer was cut off. Try asking again.';

/** No frame for this long and the panel stops waiting. A turn's model calls stream within
 * seconds; the api's function stops at 60 s, so a silent half-minute means something is stuck. */
export const STALL_MS = 30_000;

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export async function streamChat({
  apiUrl,
  conversationId,
  message,
  dispatch,
  signal,
  stallMs = STALL_MS,
}: {
  apiUrl: string;
  conversationId: string | null;
  message: string;
  dispatch: (action: Action) => void;
  signal?: AbortSignal;
  stallMs?: number;
}): Promise<void> {
  if (offline()) {
    dispatch({ type: 'failed', kind: 'offline', message: NO_CONNECTION });
    return;
  }

  // One controller for the request: the caller's abort (the visitor closed or reset the chat) and
  // the stall watchdog both end it. A stall is reported; the caller's abort is not.
  const request = new AbortController();
  const stop = () => request.abort();
  signal?.addEventListener('abort', stop, { once: true });
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      request.abort();
    }, stallMs);
  };
  const fail = (kind: 'offline' | 'server' | 'slow' | 'cut', text: string) => {
    if (!signal?.aborted) dispatch({ type: 'failed', kind, message: text });
  };

  try {
    arm();
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(conversationId ? { message, conversationId } : { message }),
        signal: request.signal,
        cache: 'no-store',
      });
    } catch {
      if (stalled) fail('slow', SLOW);
      else fail('offline', offline() ? NO_CONNECTION : OFFLINE);
      return;
    }
    await readTurn(response, dispatch, arm, () => stalled, fail, request.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

async function readTurn(
  response: Response,
  dispatch: (action: Action) => void,
  arm: () => void,
  stalled: () => boolean,
  fail: (kind: 'offline' | 'server' | 'slow' | 'cut', text: string) => void,
  aborted: AbortSignal,
): Promise<void> {
  if (!response.ok || !response.body) {
    const envelope = parseErrorEnvelope(await response.json().catch(() => null));
    const reason = envelope?.error.reason as LimitReason | undefined;
    const message = envelope?.error.message ?? OFFLINE;
    if (response.status === 404) {
      dispatch({ type: 'refused', reason: 'ended', message });
    } else if (reason && LIMIT_REASONS.includes(reason)) {
      dispatch({ type: 'refused', reason, message });
    } else if (response.status >= 500) {
      // A 5xx may be the platform's page, not our envelope: say it plainly either way.
      fail('server', SERVER);
    } else {
      fail('server', envelope?.error.message ?? SERVER);
    }
    return;
  }

  const started = response.headers.get('x-conversation-id');
  if (started) dispatch({ type: 'started', conversationId: started });

  let ended = false;
  try {
    for await (const frame of readSse(response.body, aborted)) {
      arm(); // something arrived: the watchdog starts over
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
  if (ended) return;
  if (stalled()) fail('slow', SLOW);
  else if (offline()) fail('offline', NO_CONNECTION);
  else fail('cut', CUT);
}
