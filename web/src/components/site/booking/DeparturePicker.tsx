'use client';

import Link from 'next/link';
import { type Departure, UNBOOKABLE_LABEL, unbookableReason } from '@/lib/booking';
import { afterDiscounts, type Tier, tierFor, tierLabel } from '@/lib/early-bird';
import { enquireHref } from '@/lib/enquiry-form-state';
import { formatDate, inr } from '@/lib/format';
import { istMoment, seatsWord } from '@/lib/waitlist';
import type { BookingFlow, BookingPackage } from './use-booking';
import { WaitlistJoin } from './WaitlistJoin';

const seats = (n: number) => (n === 1 ? '1 seat left' : `${n} seats left`);

/**
 * Step 1 (B0 `.deps`): every upcoming date, bookable ones as toggle buttons, the rest greyed
 * with the api's reason. The seat counts are the live read; until it lands they are the
 * prerendered page's and the caption says so. Each price is after the deal and (P17) the
 * early-bird tier that date earns today in IST; the quote has the final word.
 *
 * R44 (P6): a sold-out date offers "Join waitlist · N waiting" until 3 days out. Opened from a
 * waitlist offer's link, the picker shows only that date, held for the visitor until the offer
 * ends; an offer that has ended says why above the usual list.
 */
export function DeparturePicker({ flow, pkg }: { flow: BookingFlow; pkg: BookingPackage }) {
  const { availability, departureId, party, today, claim } = flow;
  // A live offer is for its own date only.
  const departures = claim
    ? flow.departures.filter((d) => d.id === claim.departureId)
    : flow.departures;
  const slug = pkg.slug;
  // The page is prerendered: a deal that ended at IST midnight stays in it until the cron.
  const deal = pkg.deal && pkg.deal.endsOn >= today ? pkg.deal : null;

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
      {claim?.expiresAt && (
        <p
          role="status"
          className="grid gap-0.5 rounded-btn border-[1.5px] border-ok/40 bg-ok-soft px-3 py-2.5 text-[13px] text-ink2 animate-rise"
        >
          <b className="text-ok">
            {seatsWord(claim.heldSeats || claim.party)} held for you until{' '}
            {istMoment(claim.expiresAt)}
          </b>
          <span>
            From the waitlist. Book them in full or with a deposit — a smaller party is fine, and
            the seats you don’t need go to the next person in line.
          </span>
        </p>
      )}
      {flow.claimEnded && (
        <p
          role="status"
          className="rounded-btn border border-warn/40 bg-warn-soft px-3 py-2.5 text-[13px] font-semibold text-warn"
        >
          {flow.claimEnded}
        </p>
      )}
      <div role="group" aria-label="Departure dates" className="grid gap-2">
        {departures.map((d) => {
          const tier = tierFor(pkg.earlyBird, d.date, today);
          const reason = unbookableReason(d, party, today);
          return (
            <div key={d.id} className="grid gap-2">
              <DepartureRow
                d={d}
                price={afterDiscounts(d.priceDoublePaise, deal, tier)}
                tier={tier}
                tiered={!!pkg.earlyBird}
                reason={reason}
                chosen={d.id === departureId}
                onChoose={() => flow.chooseDeparture(d.id)}
                slug={slug}
              />
              {reason === 'sold_out' && d.waitlistOpen && (
                <WaitlistJoin
                  departure={d}
                  party={party}
                  name={flow.contact.name}
                  email={flow.contact.email}
                  onSeatsFree={() => void flow.refresh()}
                />
              )}
            </div>
          );
        })}
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
  price,
  tier,
  tiered,
  reason,
  chosen,
  onChoose,
  slug,
}: {
  d: Departure;
  price: number;
  tier: Tier | null;
  /** The package has early-bird tiers: a date with none left says so. */
  tiered: boolean;
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
          {price < d.priceDoublePaise && (
            <s className="mr-1.5 text-[12.5px] font-semibold text-mute">
              <span className="sr-only">was </span>
              {inr(d.priceDoublePaise)}
            </s>
          )}
          {price < d.priceDoublePaise && <span className="sr-only">now </span>}
          {inr(price)}
          <small className="block text-[11.5px] font-semibold text-mute">per person, double</small>
        </span>
        <span className="col-span-2 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-mute">
          {meta}
          {tier ? (
            <span className="inline-flex items-center gap-1 rounded-chip bg-eb-soft px-2 py-0.5 font-extrabold text-eb">
              <ClockIcon />
              {tierLabel(tier)}
            </span>
          ) : (
            tiered && <span>No early bird left</span>
          )}
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
            : d.waiting
              ? `Fully booked · ${d.waiting} waiting`
              : 'Fully booked'}
      </span>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.3 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
