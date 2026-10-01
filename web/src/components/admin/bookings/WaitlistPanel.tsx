'use client';

import { BellRing, Hand, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { adminGet, adminRequest } from '@/lib/admin/client';
import { ApiRequestError } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';
import { seatsWord } from '@/lib/waitlist';

type Waitlist = components['schemas']['DepartureWaitlist'];
type Entry = components['schemas']['AdminWaitlistEntry'];

const STATE: Record<Entry['state'], { label: string; tone: string }> = {
  waiting: { label: 'Waiting', tone: 'bg-bg2 text-ink2' },
  offered: { label: 'Offered', tone: 'bg-ok-soft text-ok' },
  claimed: { label: 'Booking', tone: 'bg-primary-soft text-primary-ink' },
  booked: { label: 'Booked', tone: 'bg-ok-soft text-ok' },
  removed: { label: 'Removed', tone: 'bg-bg2 text-mute' },
  closed: { label: 'Closed', tone: 'bg-bg2 text-mute' },
};

const when = (iso: string) => `${istFullDate(iso)}, ${istTime(iso)}`;

/**
 * R44 (P6b): a departure's waitlist on its manifest page, for the owner and never printed. The
 * api walked it just before the page read it, so a lapsed offer already reads as lapsed and
 * freed seats are already offered. Remove takes a place off the list (an offer it held goes on
 * down the list); Offer seats offers a waiting place by hand — out of order, and past the 3
 * automatic offers — when its party fits the free seats.
 */
export function WaitlistPanel({ initial }: { initial: Waitlist }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  async function act(entry: Entry, action: 'offer' | 'remove') {
    setBusy(entry.id);
    setProblem(null);
    try {
      setList(
        await adminRequest<Waitlist>(`/admin/waitlist/${encodeURIComponent(entry.id)}/${action}`, {
          method: 'POST',
        }),
      );
    } catch (e) {
      setProblem(e instanceof ApiRequestError ? e.body.message : 'That didn’t go through.');
      // The place may have moved on in another tab or by the list's own walk: read it again.
      await adminGet<Waitlist>(
        `/admin/departures/${encodeURIComponent(list.departureId)}/waitlist`,
        {},
      )
        .then(setList)
        .catch(() => {});
    }
    setBusy(null);
    setConfirming(null);
  }

  const offerBlock = (e: Entry): string | null => {
    if (e.state !== 'waiting') return null;
    if (!list.canOffer) return 'Too close to departure, or the date isn’t on sale';
    if (e.party > list.seatsLeft) return `Needs ${seatsWord(e.party)} — ${list.seatsLeft} free`;
    return null;
  };

  return (
    <section
      id="waitlist"
      aria-labelledby="waitlist-heading"
      className="mt-8 grid gap-3 rounded-card border border-line bg-bg p-4 print:hidden"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="waitlist-heading" className="flex items-center gap-2 text-lg font-extrabold">
          <BellRing className="size-4.5 text-primary" aria-hidden />
          Waitlist
          <span className="num text-sm font-semibold text-mute">
            · {list.live.length} {list.live.length === 1 ? 'place' : 'places'}
          </span>
        </h2>
        <p className="text-[13px] text-ink2">
          <span className="num font-bold">{list.seatsLeft}</span> free now
          {list.canOffer && list.offerEndsAt
            ? ` · an offer made now holds until ${when(list.offerEndsAt)}`
            : ' · offers have closed for this date'}
        </p>
      </header>

      {problem && (
        <p
          role="alert"
          className="rounded-btn bg-warn-soft px-3 py-2 text-sm font-semibold text-warn"
        >
          {problem}
        </p>
      )}

      {list.live.length > 0 && (
        <p className="text-[12.5px] text-mute">
          Removing a place that holds an offer passes its seats down the list at once; a booking a
          place has already started is left to finish or lapse on its own.
        </p>
      )}

      {list.live.length === 0 ? (
        <p className="text-sm text-mute">
          No one is waiting. When this date sells out, the Book-now sheet offers its waitlist.
        </p>
      ) : (
        <ol className="grid gap-2" aria-label="Waiting, in order">
          {list.live.map((e) => {
            const blocked = offerBlock(e);
            return (
              <li
                key={e.id}
                className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-btn border border-line p-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto]"
              >
                <span className="num text-lg font-extrabold text-mute">{e.position}</span>
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="truncate">{e.name}</b>
                    <span
                      className={`rounded-chip px-2 py-0.5 text-[11.5px] font-bold ${STATE[e.state].tone}`}
                    >
                      {STATE[e.state].label}
                      {e.offeredByOwner && e.state !== 'waiting' ? ' · by hand' : ''}
                    </span>
                    {e.autoOffersDone && e.state === 'waiting' && (
                      <span className="rounded-chip bg-warn-soft px-2 py-0.5 text-[11.5px] font-bold text-warn">
                        3 offers ran out — by hand only
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[13px] text-ink2">
                    {seatsWord(e.party)} · {e.email}
                  </span>
                  <span className="text-[12.5px] text-mute">
                    {e.offerExpiresAt && (e.state === 'offered' || e.state === 'claimed')
                      ? `Held until ${when(e.offerExpiresAt)}`
                      : `Joined ${when(e.joinedAt)}`}
                    {e.lastEvent && !e.lastEvent.startsWith('Joined') ? ` · ${e.lastEvent}` : ''}
                  </span>
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
                  {e.state === 'waiting' && (
                    <button
                      type="button"
                      onClick={() => void act(e, 'offer')}
                      disabled={!!blocked || busy !== null}
                      title={blocked ?? undefined}
                      aria-label={`Offer seats to ${e.name}`}
                      aria-describedby={blocked ? `why-${e.id}` : undefined}
                      className="inline-flex items-center gap-1.5 rounded-btn bg-primary px-3 py-2 text-[13px] font-bold text-white transition-colors hover:bg-primary-ink disabled:opacity-45"
                    >
                      <Hand className="size-3.5" aria-hidden />
                      Offer seats
                    </button>
                  )}
                  {confirming === e.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void act(e, 'remove')}
                        disabled={busy !== null}
                        aria-label={`Yes, remove ${e.name}`}
                        className="rounded-btn bg-warn px-3 py-2 text-[13px] font-bold text-white disabled:opacity-45"
                      >
                        Yes, remove
                      </button>
                      <button
                        ref={keepRef}
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-btn px-2 py-2 text-[13px] font-bold text-ink2"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(e.id)}
                      disabled={busy !== null}
                      aria-label={`Remove ${e.name} from the waitlist`}
                      className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-[13px] font-bold text-ink2 transition-colors hover:border-ink"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Remove
                    </button>
                  )}
                  {blocked && (
                    <span id={`why-${e.id}`} className="w-full text-[12px] text-mute sm:text-right">
                      {blocked}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {list.done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-ink2">
            Done · {list.done.length}
          </summary>
          <ul className="mt-2 grid gap-1">
            {list.done.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 text-[13px] text-ink2">
                <b>{e.name}</b>
                <span>{seatsWord(e.party)}</span>
                <span
                  className={`rounded-chip px-2 text-[11.5px] font-bold ${STATE[e.state].tone}`}
                >
                  {STATE[e.state].label}
                </span>
                {e.lastEvent && <span className="text-mute">{e.lastEvent}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
