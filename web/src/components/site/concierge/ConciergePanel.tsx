'use client';

import Link from 'next/link';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { NotifyMe } from '@/components/site/alerts/NotifyMe';
import { whatsappHref, whatsappInterest } from '@/lib/business';
import { inr } from '@/lib/format';
import { finderHref } from '@/lib/concierge/finder';
import { PRIVACY_NOTE } from '@/lib/concierge/privacy';
import { EMPTY_PREFILL, type Item, type Part, type TurnError } from '@/lib/concierge/reducer';
import type { ConciergeApi } from './Concierge';
import { ChatBookingCard, ChatDepartures, ChatPackageCards } from './ChatCards';
import { HandoffForm } from './HandoffForm';
import { QuickFinder } from './QuickFinder';
import { Ticket } from './Ticket';

export { PRIVACY_NOTE };

export const MAX_CHARS = 500; // R28, api/app/schemas/chat.py MAX_MESSAGE_CHARS

/** R26's three example prompts. */
export const PROMPTS = [
  '3 days in Goa under ₹15k for 2',
  'Honeymoon in November',
  'Something for parents, easy pace',
];

const GREETING =
  'Hi! I can find you a trip from Tripsmith’s real packages, with live dates and seats. ' +
  'Where are you thinking of going?';

/** **bold**, paragraphs and line breaks: all the formatting a short reply needs. React escapes
 * the rest, so model text can never become markup. */
function RichText({ text }: { text: string }) {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((para, i) => (
      <p key={i} className="[&+&]:mt-2">
        {para.split('\n').map((line, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {line
              .split(/(\*\*[^*]+\*\*)/)
              .map((bit, k) =>
                bit.startsWith('**') && bit.endsWith('**') && bit.length > 4 ? (
                  <strong key={k}>{bit.slice(2, -2)}</strong>
                ) : (
                  bit.replace(/^\s*[*-]\s+/, '• ')
                ),
              )}
          </Fragment>
        ))}
      </p>
    ));
}

function Mark() {
  return (
    <span
      aria-hidden
      className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-primary"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[17px]">
        <path d="M3 17c3-1 5-8 9-8s4 5 9-3" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="20" cy="6" r="2.4" fill="var(--color-action)" />
      </svg>
    </span>
  );
}

function ToolChip({ part }: { part: Extract<Part, { kind: 'tool' }> }) {
  return (
    <p
      className={`inline-flex max-w-full items-center gap-2 self-start rounded-chip px-3 py-1.5 text-[12.5px] font-semibold ${part.state === 'failed' ? 'bg-warn-soft text-warn' : 'bg-bg2 text-ink2'}`}
    >
      <i
        aria-hidden
        className={`size-[7px] shrink-0 rounded-full ${part.state === 'running' ? 'animate-pulse bg-action motion-reduce:animate-none' : part.state === 'failed' ? 'bg-warn' : 'bg-ok'}`}
      />
      <span className="truncate">{part.label}</span>
    </p>
  );
}

/** C6: what each way a turn can fail offers next. Retrying is always there; the finder when the
 * model or the api is the problem (it needs neither); a person unless it's the visitor's own
 * connection. Never a dead end. */
const FALLBACKS: Record<TurnError['kind'], { finder: boolean; person: boolean }> = {
  busy: { finder: true, person: true },
  server: { finder: true, person: true },
  slow: { finder: true, person: true },
  cut: { finder: false, person: true },
  offline: { finder: false, person: false },
};

const LINK_BTN =
  'inline-flex h-9 items-center rounded-[10px] border border-line bg-bg px-3 text-[13px] font-bold whitespace-nowrap text-ink no-underline hover:border-ink';

export default function ConciergePanel({
  open,
  onClose,
  state,
  send,
  reset,
  dispatch,
  book,
}: ConciergeApi & { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // follow the stream unless the visitor scrolled up to read

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = thread.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [state.items, open]);

  // On a phone the panel covers the page: following a link should reveal it.
  const closeIfCovering = () => {
    if (!window.matchMedia('(min-width: 1024px)').matches) onClose();
  };

  const submit = (text: string) => {
    if (state.busy || !text.trim()) return;
    pinned.current = true;
    send(text);
    setDraft('');
  };

  const lastUser = state.items.findLast((it) => it.kind === 'user');
  // "Talk to a person": the form the concierge pre-filled, if it did, else a blank one.
  const talk = () => dispatch({ type: 'open-form', prefill: state.form ?? EMPTY_PREFILL });
  const finder = () => {
    pinned.current = true;
    dispatch({ type: 'open-finder' });
  };
  // Out of turns: earlier cards can't ask the concierge for dates any more.
  const ask = state.finder?.locked ? undefined : submit;

  const renderItem = (item: Item): ReactNode => {
    switch (item.kind) {
      case 'user':
        return (
          <p
            key={item.id}
            className="max-w-[84%] self-end rounded-[16px_16px_4px_16px] bg-primary px-3.5 py-2.5 font-medium break-words whitespace-pre-wrap text-white"
          >
            <span className="sr-only">You: </span>
            {item.text}
          </p>
        );
      case 'assistant':
        return (
          <div
            key={item.id}
            aria-busy={item.streaming}
            className="flex max-w-full flex-col gap-2.5 text-ink"
          >
            <span className="sr-only">Trip planner:</span>
            {item.parts.map((part, i) => {
              switch (part.kind) {
                case 'text':
                  return (
                    <div key={i} className="max-w-[94%] break-words">
                      <RichText text={part.text} />
                    </div>
                  );
                case 'tool':
                  return <ToolChip key={part.id} part={part} />;
                case 'packages':
                  return (
                    <ChatPackageCards
                      key={part.id}
                      packages={part.packages}
                      total={part.total}
                      busy={state.busy}
                      onAsk={ask}
                      onNavigate={closeIfCovering}
                    />
                  );
                case 'departures':
                  return (
                    <ChatDepartures
                      key={part.id}
                      {...part}
                      onNavigate={closeIfCovering}
                      onBook={book}
                    />
                  );
                case 'booking':
                  return (
                    <ChatBookingCard
                      key={part.id}
                      booking={part.booking}
                      onOpen={(b) => dispatch({ type: 'booked', data: b })}
                    />
                  );
                case 'alert':
                  return <NotifyMe key={part.id} offer={part.offer} compact />;
              }
            })}
            {item.streaming && item.parts.length === 0 && (
              <p className="inline-flex items-center gap-1 self-start rounded-chip bg-bg2 px-3 py-2">
                <span className="sr-only">Thinking…</span>
                {[0, 1, 2].map((n) => (
                  <i
                    key={n}
                    aria-hidden
                    style={{ animationDelay: `${n * 160}ms` }}
                    className="size-1.5 animate-bounce rounded-full bg-mute motion-reduce:animate-none"
                  />
                ))}
              </p>
            )}
            {item.error && (
              <div
                role="alert"
                data-error-kind={item.error.kind}
                className="grid gap-2.5 self-start rounded-card bg-warn-soft px-3.5 py-2.5 text-[14px] text-warn"
              >
                <p className="font-semibold">{item.error.message}</p>
                {item === state.items.at(-1) && !state.busy && (
                  <div className="flex flex-wrap gap-1.5">
                    {lastUser && !state.finder && (
                      <button
                        type="button"
                        onClick={() => submit(lastUser.text)}
                        className={`${LINK_BTN} border-ink bg-ink text-white hover:bg-ink`}
                      >
                        Try again
                      </button>
                    )}
                    {FALLBACKS[item.error.kind].finder && !state.finder && (
                      <button type="button" onClick={finder} className={LINK_BTN}>
                        Use the quick finder
                      </button>
                    )}
                    {FALLBACKS[item.error.kind].person && (
                      <button type="button" onClick={talk} className={LINK_BTN}>
                        Talk to a person
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'limit':
        return (
          <div
            key={item.id}
            className="grid gap-2.5 rounded-card border border-line bg-bg2 p-3.5 text-[14px]"
          >
            <p className="font-semibold text-ink">{item.message}</p>
            <div className="flex flex-wrap gap-1.5">
              {(item.reason === 'conversation_full' || item.reason === 'ended') && (
                <button
                  type="button"
                  onClick={reset}
                  className={`${LINK_BTN} border-primary bg-primary text-white hover:border-primary-ink hover:bg-primary-ink`}
                >
                  Start a new chat
                </button>
              )}
              {!state.finder?.locked && (
                <Link href="/packages" onClick={closeIfCovering} className={LINK_BTN}>
                  Browse all trips
                </Link>
              )}
              <button type="button" onClick={talk} className={LINK_BTN}>
                Send an enquiry
              </button>
              <a
                href={whatsappHref(whatsappInterest())}
                target="_blank"
                rel="noopener"
                className={`${LINK_BTN} border-wa bg-wa text-white hover:border-wa`}
              >
                WhatsApp us
              </a>
            </div>
          </div>
        );
      case 'finder':
        return (
          <div key={item.id} className="grid gap-2.5" data-finder-results>
            <p className="inline-flex max-w-full items-center gap-2 self-start rounded-chip bg-bg2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2">
              <i aria-hidden className="size-[7px] shrink-0 rounded-full bg-ok" />
              <span className="truncate">
                Quick finder:{' '}
                {[
                  item.query.destination?.name ?? 'anywhere',
                  item.query.month?.label,
                  item.query.maxBudget ? `under ${inr(item.query.maxBudget * 100)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </p>
            {item.packages.length ? (
              <ChatPackageCards
                packages={item.packages}
                total={item.total}
                busy={false}
                onNavigate={closeIfCovering}
                moreHref={finderHref(item.query)}
              />
            ) : (
              <p className="text-ink">
                Nothing matches all three. Try “Anywhere” or a bigger budget, or{' '}
                <button
                  type="button"
                  onClick={talk}
                  className="font-bold text-primary-ink underline underline-offset-2"
                >
                  ask a person
                </button>{' '}
                to plan a trip that isn’t on the site.
              </p>
            )}
          </div>
        );
      case 'handed-off':
        return (
          <div
            key={item.id}
            role="status"
            className="grid gap-1 rounded-card border border-ok/40 bg-ok-soft p-3.5 text-[14px] text-ink"
          >
            <p className="font-bold">
              Thanks, {item.firstName} — it’s with our team. Ref{' '}
              <span className="num">{item.ref}</span>.
            </p>
            <p>
              {item.emailed ? 'We’ve emailed you a copy. ' : ''}
              They have this chat too, so you won’t need to repeat yourself.
            </p>
          </div>
        );
    }
  };

  return (
    <section
      role="dialog"
      aria-label="Tripsmith trip planner"
      hidden={!open}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      data-concierge-panel
      className="fixed inset-0 z-40 flex animate-panel-in flex-col bg-bg lg:inset-auto lg:top-0 lg:right-0 lg:bottom-0 lg:w-[440px] lg:border-l lg:border-line lg:shadow-[-24px_0_50px_-30px_rgb(20_32_42/0.55)]"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
        <Mark />
        <div className="min-w-0 leading-tight">
          <h2 className="text-[15.5px] font-extrabold whitespace-nowrap">
            <span className="max-sm:sr-only">Tripsmith trip planner</span>
            <span aria-hidden className="sm:hidden">
              Trip planner
            </span>
          </h2>
          <small className="text-[12px] font-semibold text-ok">Real trips only</small>
        </div>
        <button
          type="button"
          onClick={talk}
          aria-pressed={state.form !== null}
          className="ml-auto rounded-chip border border-line bg-bg px-3 py-1.5 text-[13px] font-bold whitespace-nowrap text-ink hover:border-ink aria-pressed:border-ink aria-pressed:bg-bg2"
        >
          Talk to a person
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the trip planner"
          className="grid size-9 shrink-0 place-items-center rounded-[9px] text-[22px] leading-none text-mute hover:bg-bg2 hover:text-ink"
        >
          ×
        </button>
      </header>

      <Ticket ticket={state.ticket} />

      {state.form && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <HandoffForm
            prefill={state.form}
            conversationId={state.conversationId}
            onClose={() => dispatch({ type: 'close-form' })}
            onSent={(created) =>
              dispatch({
                type: 'handed-off',
                ref: created.ref,
                firstName: created.firstName,
                emailed: created.emailed,
              })
            }
          />
        </div>
      )}

      <div
        hidden={state.form !== null}
        ref={thread}
        role="log"
        aria-label="Conversation"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4 [&>*]:shrink-0"
      >
        <p className="max-w-[94%] text-ink">{GREETING}</p>
        {state.items.length === 0 && !state.finder && (
          <div className="grid gap-1.5" aria-label="Try asking">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                className="rounded-btn border border-line bg-bg px-3.5 py-2.5 text-left text-[14px] font-semibold text-ink transition-colors hover:border-primary hover:bg-primary-soft"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {state.items.map(renderItem)}
      </div>

      {state.finder && state.form === null && (
        <QuickFinder
          locked={state.finder.locked}
          onFound={(query, packages, total) => {
            pinned.current = true;
            dispatch({ type: 'found', query, packages, total });
          }}
          onBack={() => {
            dispatch({ type: 'close-finder' });
            requestAnimationFrame(() => input.current?.focus());
          }}
          onNavigate={closeIfCovering}
        />
      )}

      <form
        hidden={state.form !== null || state.finder !== null}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        className="shrink-0 border-t border-line bg-bg px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2 rounded-[14px] border border-line py-1.5 pr-1.5 pl-3.5 focus-within:border-primary">
          <label htmlFor="concierge-input" className="sr-only">
            Message the trip planner
          </label>
          <textarea
            id="concierge-input"
            ref={input}
            rows={1}
            value={draft}
            maxLength={MAX_CHARS}
            placeholder="Tell me about your trip…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(draft);
              }
            }}
            className="field-sizing-content max-h-28 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-mute"
          />
          <button
            type="submit"
            disabled={state.busy || !draft.trim()}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-action font-extrabold text-ink transition-opacity disabled:opacity-45"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
              <path
                d="M12 19V5M5 12l7-7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="mt-1.5 flex items-start gap-3 px-0.5">
          <p className="flex-1 text-[11.5px] leading-snug text-mute">{PRIVACY_NOTE}</p>
          {draft.length > MAX_CHARS - 100 && (
            <span className="num shrink-0 text-[11.5px] font-semibold text-mute">
              {draft.length}/{MAX_CHARS}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
