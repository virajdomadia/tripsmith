'use client';

import type { Quote } from '@/lib/booking';
import { addDays } from '@/lib/booking';
import type { LadderRung } from '@/lib/early-bird';
import { inr, shortDate } from '@/lib/format';
import type { BookingFlow } from './use-booking';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const LOW = 34; // px: the cheapest bar
const RANGE = 46; // px: how much taller the dearest bar is

/**
 * R47 (P17), Book now B `.stairs`: what waiting costs. The rungs are the server's — this party's
 * trip fare if booked today, then from the day after each running early-bird tier ends (deal,
 * early-bird and coupon applied, add-ons left out). Nothing is priced here. Hidden when the
 * package has no early-bird; one rung = every tier has already ended for this date. With a
 * deposit on offer (P5) the note names the day its balance falls due.
 */
export function PriceLadder({ flow }: { flow: BookingFlow }) {
  const { quote, departure, reason } = flow;
  const q: Quote | undefined =
    quote.status === 'ok' ? quote.quote : quote.status === 'loading' ? quote.last : undefined;
  const rungs = q?.ladder ?? [];
  if (!departure || (reason && reason !== 'short') || !q || rungs.length === 0) return null;

  const fares = rungs.map((r) => r.farePaise);
  const [min, max] = [Math.min(...fares), Math.max(...fares)];
  const height = (fare: number) => LOW + (max > min ? ((fare - min) / (max - min)) * RANGE : 0);
  const today = rungs[0].farePaise;

  return (
    <div
      aria-busy={quote.status === 'loading'}
      className={`grid gap-2.5 rounded-[14px] border border-[#d6e0f5] bg-bg2 px-3.5 py-3 transition-opacity duration-200 ${quote.status === 'loading' ? 'opacity-55' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
        <b className="inline-flex items-center gap-1.5 text-sm">
          <ChartIcon />
          What waiting costs
        </b>
        <span className="text-[12.5px] font-semibold text-mute">
          Trip fare for {plural(flow.party, 'traveller')}, add-ons extra
        </span>
      </div>
      <ol
        aria-label={`Price ladder for ${shortDate(q.date)}`}
        className="grid items-end gap-2"
        style={{ gridTemplateColumns: `repeat(${rungs.length}, minmax(0, 1fr))` }}
      >
        {rungs.map((r, i) => (
          <Rung
            key={r.fromOn ?? 'today'}
            rung={r}
            prev={rungs[i - 1]}
            base={today}
            height={height(r.farePaise)}
          />
        ))}
      </ol>
      <p className="text-[12px] font-semibold text-mute">
        {rungs.length === 1 &&
          `No early bird left on ${shortDate(q.date)}; this is the price until departure. `}
        Counted in IST from the day you book; never on add-ons.
        {q.deposit
          ? ` Reserving with ${q.deposit.percent}% now? The balance falls due ${shortDate(q.deposit.dueOn)}.`
          : ''}
      </p>
    </div>
  );
}

function Rung({
  rung,
  prev,
  base,
  height,
}: {
  rung: LadderRung;
  prev: LadderRung | undefined;
  base: number;
  height: number;
}) {
  const now = rung.fromOn == null;
  const eb = rung.earlyBird;
  // What ended the day before this rung starts: the tier, and a deal that ran out on the way.
  const ended = prev?.earlyBird && rung.fromOn ? addDays(rung.fromOn, -1) : null;
  const why = [
    ended && prev?.earlyBird ? `tier ${prev.earlyBird.tier} ends ${shortDate(ended)}` : null,
    prev?.deal && !rung.deal ? 'deal ends' : null,
  ].filter(Boolean);
  return (
    <li className="grid min-w-0 content-end gap-0.5">
      <span
        className={`mb-1.5 flex justify-center rounded-t-[10px] rounded-b-[4px] pt-2 text-[13px] font-extrabold transition-[height] duration-500 ease-(--ease-out) sm:text-sm ${now ? 'bg-primary text-white' : 'bg-[#d8e1f4] text-ink'}`}
        style={{ height }}
      >
        <span className="num">{inr(rung.farePaise)}</span>
      </span>
      <b className="text-[13px]">{now ? 'Book today' : `From ${shortDate(rung.fromOn!)}`}</b>
      <small
        className={`text-[11.5px] leading-snug font-semibold ${now ? 'text-mute' : 'text-warn'}`}
      >
        {now
          ? eb
            ? `Early bird −${inr(eb.perTravellerPaise)} each`
            : 'No early bird left'
          : [`+${inr(rung.farePaise - base)}`, ...why].join(' · ')}
      </small>
    </li>
  );
}

function ChartIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M2.5 13.5h11M4.5 11V8.5M8 11V6M11.5 11V3.5" strokeLinecap="round" />
    </svg>
  );
}
