'use client';

import { Check, FileText, Hand, MapPin, PenLine, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { istTime } from '@/components/admin/enquiries/ist-date';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import { adminRequest } from '@/lib/admin/client';
import { manifestHref } from '@/lib/admin/booking-filters';
import { addDays, dayLabel, FILL_LABEL, fillOf, type CalendarPanel } from '@/lib/admin/calendar';
import { ApiRequestError } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';
import { seatsWord } from '@/lib/waitlist';
import { cn } from '@/lib/utils';
import { Meter } from './FillBar';

export type Waitlist = components['schemas']['DepartureWaitlist'];
type WaitEntry = components['schemas']['AdminWaitlistEntry'];
type Booking = CalendarPanel['bookings'][number];

const chip = 'rounded-chip px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap';
const FILL_CHIP = {
  full: 'bg-primary-soft text-primary-ink',
  hot: 'bg-ok-soft text-ok',
  open: 'bg-warn-soft text-warn',
  low: 'bg-bad-soft text-bad',
} as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-btn border border-line px-3 py-2 text-[13px] font-bold text-ink2 transition-colors hover:border-ink';

/** The first waiting party, in list order, that fits the free seats — "Offer seats" goes there. */
export function offerTarget(w: Waitlist | null): WaitEntry | null {
  if (!w || !w.canOffer) return null;
  return w.live.find((e) => e.state === 'waiting' && e.party <= w.seatsLeft) ?? null;
}

function bookingChip(b: Booking, due: string | null) {
  if (b.status === 'pending') {
    const until = b.holdExpiresAt ? ` · until ${istTime(b.holdExpiresAt)}` : '';
    return (
      <span className={cn(chip, 'bg-primary-soft text-primary-ink')}>
        {b.channel === 'web' ? 'Checkout hold' : 'Payment link'}
        {until}
      </span>
    );
  }
  if (b.status === 'partially_paid') {
    return (
      <span className={cn(chip, 'bg-warn-soft text-warn')}>
        {inr(b.totalPaise - b.paidPaise)} due{due ? ` ${dayLabel(due)}` : ''}
      </span>
    );
  }
  return (
    <span className={cn(chip, 'inline-flex items-center gap-1 bg-ok-soft text-ok')}>
      <Check className="size-3" aria-hidden />
      Paid
    </span>
  );
}

/**
 * Mockup A's departure panel: seats, money, readiness, leader and meeting point, the actions
 * (manifest, edit the date in its package, offer free seats to the waitlist, a counter booking)
 * and the bookings and waitlist tabs. The waitlist is P6b's, walked just before it was read.
 */
export function DeparturePanel({
  p,
  waitlist,
  today,
  onClose,
  onChanged,
}: {
  p: CalendarPanel;
  waitlist: Waitlist | null;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const d = p.departure;
  const fill = fillOf(d);
  const [tab, setTab] = useState<'bk' | 'wl'>('bk');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const past = d.date < today;
  const target = past ? null : offerTarget(waitlist);
  const live = waitlist?.live ?? [];
  const why: string[] = [];
  if (!past && !target) {
    if (d.free <= 0) why.push('No free seats to offer');
    else if (live.length) why.push(`No waiting party fits ${seatsWord(d.free)}`);
    else why.push('No one is waiting');
  }
  if (!past && d.free <= 0) why.push('Sold out: add seats in Edit departure to take a booking');

  async function offer(e: WaitEntry) {
    setBusy(true);
    setNote(null);
    try {
      await adminRequest(`/admin/waitlist/${encodeURIComponent(e.id)}/offer`, { method: 'POST' });
      setNote(`Offered ${seatsWord(e.party)} to ${e.name}. The email is on its way.`);
    } catch (err) {
      setNote(err instanceof ApiRequestError ? err.body.message : 'That didn’t go through.');
    }
    setBusy(false);
    onChanged();
  }

  const bookings = p.bookings;
  return (
    <div className="grid gap-0" aria-label={`${p.packageName}, ${dayLabel(d.date)}`}>
      <section className="grid gap-1 border-b border-line p-4">
        <div className="flex items-center gap-2">
          <span className={cn(chip, FILL_CHIP[fill])}>{FILL_LABEL[fill]}</span>
          {p.draft && <span className={cn(chip, 'bg-bg2 text-ink2')}>Draft</span>}
          {d.guaranteed && <span className={cn(chip, 'bg-ok-soft text-ok')}>Guaranteed</span>}
          <span className="truncate text-[12.5px] text-mute">
            {p.destinationName} · {plural(p.nights, 'night', 'nights')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the panel"
            className="ml-auto rounded-md p-1 text-mute hover:bg-bg2 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <h2 className="text-[20px] leading-tight font-extrabold">{p.packageName}</h2>
        <p className="text-[13px] text-mute">
          {dayLabel(d.date)} → {dayLabel(d.returns)} {d.returns.slice(0, 4)}
        </p>
      </section>

      <section className="grid gap-2.5 border-b border-line p-4">
        <dl className="grid grid-cols-4 gap-2 text-center">
          {(
            [
              ['sold', d.sold],
              ['held', d.held],
              ['free', d.free],
              ['seats', d.seatsTotal],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex flex-col-reverse rounded-btn bg-bg2 py-2">
              <dt className="mt-1 text-[11.5px] font-bold text-mute">{k}</dt>
              <dd className="num text-[20px] leading-none font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>
        <span className={`st-${fill}`}>
          <Meter sold={d.sold} held={d.held} of={d.seatsTotal} />
        </span>
      </section>

      <section className="border-b border-line p-4">
        <dl className="grid gap-1.5 text-[13px]">
          {(
            [
              ['Price per person', `${inr(d.priceDoublePaise)} (double)`],
              ['Revenue booked', inr(d.revenuePaise)],
              ['Collected', inr(d.collectedPaise)],
              [
                'Balances due',
                d.balancePaise
                  ? `${inr(d.balancePaise)} · ${plural(d.balanceBookings, 'booking', 'bookings')}${d.firstDueOn ? ` · by ${dayLabel(d.firstDueOn)}` : ''}`
                  : 'None, all paid in full',
              ],
              [
                'Details missing',
                d.missingTravellers
                  ? plural(d.missingTravellers, 'traveller', 'travellers')
                  : 'None',
              ],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-mute">{k}</dt>
              <dd className="num text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-2 border-b border-line p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[15px] font-extrabold">Readiness</h3>
          <b className="num">
            {d.readyPercent === null ? 'No travellers yet' : `${d.readyPercent}%`}
          </b>
        </div>
        <Meter sold={d.readyPercent ?? 0} of={100} />
        {p.readinessParts.length > 0 && (
          <p className="text-[12.5px] text-mute">
            {p.readinessParts.map((x) => `${x.label} ${x.percent}%`).join(' · ')}
          </p>
        )}
      </section>

      <section className="grid gap-3 border-b border-line p-4">
        <div className="flex items-center gap-3">
          {p.leader ? (
            <>
              <LeaderAvatar leader={p.leader} size={40} />
              <span className="grid">
                <b className="text-[14px]">{p.leader.name}</b>
                <small className="text-[12.5px] text-mute">
                  Trip leader{p.leader.byDefault ? ' (package default)' : ''}
                  {p.leader.phone ? ` · ${p.leader.phone}` : ''}
                </small>
              </span>
            </>
          ) : (
            <span className="text-[13px] text-mute">
              No trip leader yet — pick one in Edit departure.
            </span>
          )}
        </div>
        <div className="flex items-start gap-2.5 text-[13px]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span className="grid">
            <b>Meeting point</b>
            {p.meeting ? (
              <small className="text-[12.5px] text-ink2">
                {p.meeting.place}
                {p.meeting.time ? ` · ${p.meeting.time.slice(0, 5)}` : ''}
                {p.meeting.note ? ` · ${p.meeting.note}` : ''}
              </small>
            ) : (
              <small className="text-[12.5px] text-mute">Not set — add it in the package.</small>
            )}
          </span>
        </div>
      </section>

      <section className="grid gap-2 border-b border-line p-4">
        <div className="grid grid-cols-2 gap-2">
          <Link href={manifestHref(d.id)} target="_blank" className={btn}>
            <FileText className="size-4" aria-hidden />
            Manifest
          </Link>
          <Link
            href={`/admin/packages/${encodeURIComponent(d.packageId)}#dep-${d.id}`}
            className={btn}
          >
            <PenLine className="size-4" aria-hidden />
            Edit departure
          </Link>
          {!past && (
            <button
              type="button"
              disabled={!target || busy}
              onClick={() => target && void offer(target)}
              className={cn(
                btn,
                'col-span-2 border-primary bg-primary text-white hover:border-primary-ink hover:bg-primary-ink disabled:border-line disabled:bg-bg2 disabled:text-mute',
              )}
            >
              <Hand className="size-4" aria-hidden />
              {target
                ? `Offer ${seatsWord(target.party)} to #${target.position} ${target.name.split(' ')[0]}`
                : 'Offer seats to the waitlist'}
            </button>
          )}
          {!past &&
            (d.free > 0 && !p.draft ? (
              <Link
                href={`/admin/bookings/new?departure=${encodeURIComponent(d.id)}`}
                className={cn(btn, 'col-span-2')}
              >
                <Plus className="size-4" aria-hidden />
                New booking on this departure
              </Link>
            ) : (
              <span className={cn(btn, 'col-span-2 cursor-not-allowed text-mute')} aria-disabled>
                <Plus className="size-4" aria-hidden />
                New booking on this departure
              </span>
            ))}
        </div>
        {why.length > 0 && <p className="text-[12.5px] text-mute">{why.join('. ')}.</p>}
        {p.draft && !past && (
          <p className="text-[12.5px] text-mute">
            A draft package can’t take bookings until it’s live.
          </p>
        )}
        {note && (
          <p
            role="status"
            className="rounded-btn bg-bg2 px-3 py-2 text-[13px] font-semibold text-ink2"
          >
            {note}
          </p>
        )}
      </section>

      <section className="grid gap-2 p-4">
        <div
          role="tablist"
          aria-label="Who is on this date"
          className="flex gap-1 rounded-lg bg-bg2 p-1"
        >
          {(
            [
              ['bk', 'Bookings', bookings.length + p.holds.length],
              ['wl', 'Waitlist', live.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-[13px] font-bold text-ink2',
                tab === k && 'bg-bg text-ink shadow-sm',
              )}
            >
              {label} <span className="num text-mute">{n}</span>
            </button>
          ))}
        </div>
        {tab === 'bk' ? (
          bookings.length + p.holds.length ? (
            <ul className="grid gap-1.5" role="tabpanel">
              {p.holds.map((h, i) => (
                <li
                  key={`h${i}`}
                  className="flex items-start justify-between gap-2 rounded-btn border border-line p-2.5"
                >
                  <span className="grid min-w-0">
                    <b className="truncate text-[13px]">{h.name}</b>
                    <span className="text-[12px] text-mute">
                      {h.kind === 'waitlist_offer' ? 'Waitlist offer' : `Moving here · ${h.ref}`} ·{' '}
                      {plural(h.party, 'traveller', 'travellers')}
                    </span>
                  </span>
                  <span className={cn(chip, 'bg-primary-soft text-primary-ink')}>
                    Held{h.expiresAt ? ` · until ${istTime(h.expiresAt)}` : ''}
                  </span>
                </li>
              ))}
              {bookings.map((b) => (
                <li
                  key={b.ref}
                  className="flex items-start justify-between gap-2 rounded-btn border border-line p-2.5"
                >
                  <span className="grid min-w-0">
                    <Link
                      href={`/admin/bookings?sel=${encodeURIComponent(b.ref)}`}
                      className="num w-fit font-mono text-[12.5px] font-bold text-primary"
                    >
                      {b.ref}
                    </Link>
                    <span className="truncate text-[12px] text-ink2">
                      {b.leadName} · {plural(b.travellers, 'traveller', 'travellers')} ·{' '}
                      {inr(b.totalPaise)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {bookingChip(b, b.balanceDueOn)}
                    {b.missingTravellers > 0 && (
                      <span className={cn(chip, 'bg-bad-soft text-bad')}>
                        Details missing · {b.missingTravellers}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p role="tabpanel" className="rounded-btn bg-bg2 p-3 text-[13px] text-ink2">
              No bookings yet.
              {!past && d.free > 0 && !p.draft
                ? ' New booking takes the first one at the counter.'
                : ''}
            </p>
          )
        ) : (
          <div role="tabpanel" className="grid gap-1.5">
            <p className="text-[12.5px] text-mute">
              {addDays(d.date, -3) > today
                ? `Waitlist closes ${dayLabel(addDays(d.date, -3))}, 3 days before departure. Offers walk the list in order; a bigger party is skipped but keeps its place.`
                : 'Waitlist closed.'}
            </p>
            {waitlist === null ? (
              <p className="text-[13px] text-mute">Loading the waitlist…</p>
            ) : live.length ? (
              <ol className="grid gap-1.5">
                {live.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-btn border border-line p-2.5"
                  >
                    <span className="grid min-w-0">
                      <b className="truncate text-[13px]">
                        #{e.position} {e.name}
                      </b>
                      <span className="text-[12px] text-mute">Party of {e.party}</span>
                    </span>
                    <span
                      className={cn(
                        chip,
                        e.state === 'waiting'
                          ? e.party <= waitlist.seatsLeft && waitlist.seatsLeft > 0
                            ? 'bg-ok-soft text-ok'
                            : 'bg-bg2 text-ink2'
                          : 'bg-primary-soft text-primary-ink',
                      )}
                    >
                      {e.state === 'waiting'
                        ? waitlist.seatsLeft > 0
                          ? e.party <= waitlist.seatsLeft
                            ? 'Fits now'
                            : `Needs ${e.party}, ${waitlist.seatsLeft} free`
                          : 'Waiting'
                        : e.state === 'offered'
                          ? `Offered${e.offerExpiresAt ? ` · until ${istTime(e.offerExpiresAt)}` : ''}`
                          : 'Booking'}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-btn bg-bg2 p-3 text-[13px] text-ink2">
                No one is waiting. The waitlist opens when the departure sells out.
              </p>
            )}
            <Link
              href={`${manifestHref(d.id)}#waitlist`}
              target="_blank"
              className="w-fit text-[13px] font-bold text-primary"
            >
              Manage the waitlist on the manifest →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
