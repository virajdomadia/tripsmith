'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { errorFromResponse } from '@/lib/api-errors';
import { requestBooking } from '@/lib/concierge/book-request';
import { streamChat } from '@/lib/concierge/client';
import { type Action, initialState, reducer, type State } from '@/lib/concierge/reducer';

/**
 * The AI trip planner (v3 C2, R26): a chatbot — a round chat button on every public page and a
 * chat window in the corner (full-screen on a phone).
 *
 * Mounted once in the `(site)` layout, so the conversation lives in this component's state while
 * the visitor moves between pages; a reload starts a new chat. The panel's code — everything but
 * this launcher and the reducer — loads on the first hover, focus or tap of the launcher, so no
 * public page pays for it up front (R26: page budgets unchanged).
 */

const loadPanel = () => import('./ConciergePanel');
const ConciergePanel = dynamic(loadPanel, {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="fixed inset-0 z-40 grid place-items-center bg-bg font-semibold text-mute lg:inset-auto lg:right-6 lg:bottom-6 lg:h-[min(660px,calc(100dvh-48px))] lg:w-[400px] lg:rounded-2xl lg:border lg:border-line lg:shadow-[0_24px_60px_-20px_rgb(20_32_42/0.45)]"
    >
      Opening the trip planner…
    </div>
  ),
});

export type ConciergeApi = {
  state: State;
  send: (text: string) => void;
  reset: () => void;
  dispatch: (action: Action) => void;
  /** A departure list's "Book" (C3): same hand-off as the model's startBooking, no turn spent.
   *  Resolves to an error message to show, or null once the sheet is on its way. */
  book: (departureId: string) => Promise<string | null>;
};

const BOOK_FAILED = 'Couldn’t open that date just now — try again, or open the trip page.';

/** The conversation and what the panel can do to it. */
export function useConcierge(apiUrl: string): ConciergeApi {
  const [state, dispatch] = useReducer(reducer, initialState);
  const live = useRef<AbortController | null>(null);
  const conversation = useRef<string | null>(null);
  conversation.current = state.conversationId;
  const busy = useRef(false);
  busy.current = state.busy;

  const send = useCallback(
    (raw: string) => {
      const message = raw.trim();
      if (!message || busy.current) return;
      busy.current = true;
      dispatch({ type: 'send', text: message });
      const controller = new AbortController();
      live.current = controller;
      void streamChat({
        apiUrl,
        conversationId: conversation.current,
        message,
        dispatch: (action) => {
          if (!controller.signal.aborted) dispatch(action);
        },
        signal: controller.signal,
      });
    },
    [apiUrl],
  );

  const reset = useCallback(() => {
    live.current?.abort();
    live.current = null;
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => () => live.current?.abort(), []);

  const party = useRef(state.party);
  party.current = state.party;
  const book = useCallback(async (departureId: string): Promise<string | null> => {
    const conversationId = conversation.current;
    if (!conversationId) return BOOK_FAILED;
    try {
      const res = await fetch('/api/chat/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, departureId, ...party.current }),
      });
      const body: unknown = await res.json().catch(() => undefined);
      if (!res.ok) {
        const err = errorFromResponse(res.status, res.statusText, body);
        return err.body.code === 'conflict' || err.body.code === 'not_found'
          ? err.body.message
          : BOOK_FAILED;
      }
      dispatch({ type: 'booked', data: body });
      return null;
    } catch {
      return BOOK_FAILED;
    }
  }, []);

  return { state, send, reset, dispatch, book };
}

const isPhone = () => !window.matchMedia('(min-width: 1024px)').matches;

export function Concierge({ apiUrl }: { apiUrl: string }) {
  const concierge = useConcierge(apiUrl.replace(/\/$/, ''));
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { state, dispatch } = concierge;

  const show = () => {
    setMounted(true);
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    // Back to where the visitor was (WCAG 2.4.3); after the panel hides.
    requestAnimationFrame(() => launcher.current?.focus());
  }, []);

  // C3: once the turn that started a booking has finished (or a list's "Book" answered), go to
  // the package page with the Book-now sheet open. On a phone the panel covers the page, so it
  // closes; the chat stays in memory for when they come back.
  const go = state.busy ? null : state.go;
  useEffect(() => {
    if (!go) return;
    dispatch({ type: 'went' });
    requestBooking(go.url);
    router.push(go.url, { scroll: false });
    if (isPhone()) setOpen(false);
  }, [go, dispatch, router]);

  return (
    <>
      <button
        ref={launcher}
        type="button"
        hidden={open}
        onClick={show}
        onPointerEnter={() => void loadPanel()}
        onFocus={() => void loadPanel()}
        aria-haspopup="dialog"
        data-concierge-launcher
        aria-label="Chat with us"
        title="Chat with us"
        className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-white shadow-[0_16px_30px_-12px_rgb(20_32_42/0.7)] transition-transform hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100 [main:has([data-cta-bar])~&]:bottom-[calc(max(10px,env(safe-area-inset-bottom))+70px)] [[data-compare-tray]~&]:bottom-[calc(max(16px,env(safe-area-inset-bottom))+136px)] lg:right-6 lg:bottom-[88px] lg:left-auto lg:[main:has([data-cta-bar])~&]:bottom-[88px] lg:[[data-compare-tray]~&]:bottom-[88px]"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-[26px]">
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16.9A2.5 2.5 0 0 1 4 14.5z"
            fill="currentColor"
          />
          <circle cx="9" cy="9.6" r="1.2" fill="var(--color-primary)" />
          <circle cx="12" cy="9.6" r="1.2" fill="var(--color-primary)" />
          <circle cx="15" cy="9.6" r="1.2" fill="var(--color-primary)" />
        </svg>
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 size-3 animate-concierge-pulse rounded-full border-2 border-white bg-action"
        />
      </button>
      {mounted && <ConciergePanel open={open} onClose={close} {...concierge} />}
    </>
  );
}
