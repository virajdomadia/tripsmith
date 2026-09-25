'use client';

import Link from 'next/link';
import { type Departure, UNBOOKABLE_LABEL, unbookableReason } from '@/lib/booking';
import { enquireHref } from '@/lib/enquiry-form-state';
import { formatDate, inr } from '@/lib/format';
import type { BookingFlow } from './use-booking';

const seats = (n: number) => (n === 1 ? '1 seat left' : `${n} seats left`);

/**
 * Step 1 (B0 `.deps`): every upcoming date, bookable ones as toggle buttons, the rest greyed
 * with the api's reason. The seat counts are the live read; until it lands they are the
 * prerendered page's and the caption says so.
 */
export function DeparturePicker({ flow, slug }: { flow: BookingFlow; slug: string }) {
  const { departures, availability, departureId, party, today } = flow;

  if (departures.length === 0)
    return (
      <p className="rounded-btn border-[1.5px] border-dashed border-line px-3.5 py-3 text-sm text-ink2">
        No upcoming dates right now.{' '}
        <Link href={enquireHref(slug)} className="font-bold">
          Enquire
        </Link>{' '}
        and we’ll tell you when the next one opens.
      </p>
    );

  return (
    <div className="grid gap-2">
      <div role="group" aria-label="Departure dates" className="grid gap-2">
        {departures.map((d) => (
          <DepartureRow
            key={d.id}
            d={d}
            reason={unbookableReason(d, party, today)}
            chosen={d.id === departureId}
            onChoose={() => flow.chooseDeparture(d.id)}
            slug={slug}
          />
        ))}
      </div>
      <p aria-live="polite" className="flex items-center gap-2 text-xs font-bold">
        {availability.status === 'live' ? (
          <>
            <span className="live-dot" aria-hidden />
            <span className="text-ok">Live availability · checked just now</span>
          </>
        ) : availability.status === 'error' ? (
          <span className="text-warn">
            Couldn’t check live seats — counts may be out of date.{' '}
            <button type="button" onClick={() => void flow.refresh()} className="underline">
              Try again
            </button>
          </span>
        ) : (
          <span className="text-mute">Checking live seats…</span>
        )}
      </p>
    </div>
  );
}

function DepartureRow({
  d,
  reason,
  chosen,
  onChoose,
  slug,
}: {
  d: Departure;
  reason: ReturnType<typeof unbookableReason>;
  chosen: boolean;
  onChoose: () => void;
  slug: string;
}) {
  const meta =
    d.seatsLeft > 0 && d.seatsLeft <= 4 ? (
      <span className="rounded-chip bg-warn-soft px-2 py-0.5 text-warn">{seats(d.seatsLeft)}</span>
    ) : d.guaranteed ? (
      <>
        <span className="rounded-chip bg-ok-soft px-2 py-0.5 text-ok">Guaranteed</span>
        {seats(d.seatsLeft)}
      </>
    ) : (
      seats(d.seatsLeft)
    );

  // Selectable: bookable, or bookable but short of seats for this party (the warning explains).
  if (!reason || reason === 'short')
    return (
      <button
        type="button"
        aria-pressed={chosen}
        onClick={onChoose}
        className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-btn border-[1.5px] border-line bg-bg px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ease-(--ease-out) hover:border-ink active:scale-[0.99] aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:shadow-[inset_0_0_0_1px_var(--color-primary)]"
      >
        <span className="font-extrabold">{formatDate(d.date)}</span>
        <span className="num text-right font-extrabold">
          {inr(d.priceDoublePaise)}
          <small className="block text-[11.5px] font-semibold text-mute">per person, double</small>
        </span>
        <span className="col-span-2 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-mute">
          {meta}
        </span>
      </button>
    );

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-btn border-[1.5px] border-dashed border-line bg-[#f7f8fa] px-3 py-2.5 text-mute">
      <span className="font-extrabold">{formatDate(d.date)}</span>
      {reason === 'on_request' ? (
        <Link href={enquireHref(slug)} className="text-[12.5px] font-bold no-underline">
          {UNBOOKABLE_LABEL.on_request}
        </Link>
      ) : (
        <span className="justify-self-end rounded-chip bg-[#eef0f2] px-2.5 py-1 text-xs font-bold text-mute">
          {UNBOOKABLE_LABEL[reason]}
        </span>
      )}
      <span className="col-span-2 text-[12.5px] font-semibold">
        {reason === 'on_request'
          ? 'Date set, price not yet — we’ll quote you'
          : reason === 'too_soon'
            ? 'Online booking closes 2 days before departure — WhatsApp us'
            : 'Fully booked'}
      </span>
    </div>
  );
}
