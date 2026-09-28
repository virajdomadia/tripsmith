'use client';

import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  IndianRupee,
  Link2,
  Mail,
  PackageMinus,
  RotateCcw,
  Star,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { cn } from '@/lib/utils';
import {
  byDay,
  changes,
  CHIPS,
  countByChip,
  toneOf,
  type BookingHistory,
  type Chip,
  type EntryTone,
  type HistoryEntry,
} from '@/lib/history';

const DOT: Record<EntryTone, string> = {
  ok: 'border-transparent bg-ok-soft text-ok',
  bad: 'border-transparent bg-bad-soft text-bad',
  warn: 'border-transparent bg-warn-soft text-warn',
  primary: 'border-primary bg-primary text-white',
  mute: 'border-line bg-bg text-mute',
};

function iconOf(kind: string): LucideIcon {
  if (kind === 'booked') return Ticket;
  if (kind.startsWith('email.')) return Mail;
  if (kind.startsWith('review.')) return Star;
  if (kind === 'account.linked') return Link2;
  if (kind.startsWith('refund.')) return RotateCcw;
  if (kind === 'payment.failed') return CircleX;
  if (kind.startsWith('payment.') || kind.startsWith('order.')) return IndianRupee;
  if (kind === 'trip.completed' || kind === 'cancellation.approved') return CircleCheck;
  if (kind.startsWith('hold.')) return Clock;
  if (kind === 'addon.removed') return PackageMinus; // P8b: the owner took one off
  return Ban;
}

/**
 * The booking's history (R54, P16) — one merged timeline of changes, payments and emails,
 * oldest first, with a chip per kind (mockup Booking detail B/C: time · dot · who + what). An
 * eye marks what the customer also sees on My trips. Entries 0010 rebuilt from v2 records sit
 * above a divider; their ≈ times were read off a row's last update.
 */
export function History({ history }: { history: BookingHistory }) {
  const [chip, setChip] = useState<Chip>('all');
  const counts = countByChip(history.entries);
  const shown = history.entries.filter((e) => chip === 'all' || e.group === chip);
  const lastRebuilt = shown.findLastIndex((e) => e.rebuilt);
  const divider = history.rebuiltOn && lastRebuilt >= 0 ? shown[lastRebuilt]?.id : undefined;

  return (
    <div className="grid gap-3">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {CHIPS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={chip === key}
            disabled={key !== 'all' && counts[key] === 0}
            onClick={() => setChip(key)}
            className={cn(
              'rounded-chip border-[1.5px] border-line bg-bg px-3 py-1 text-[13px] font-semibold text-ink2 transition-colors hover:border-ink disabled:opacity-45 disabled:hover:border-line',
              chip === key && 'border-primary bg-primary-soft text-primary-ink',
            )}
          >
            {label} <span className="num text-mute">{counts[key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-mute">Nothing recorded yet.</p>
      ) : (
        <ol
          key={chip}
          aria-label="History"
          className="relative grid gap-0.5 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-line sm:before:left-[83px]"
        >
          {byDay(shown, istFullDate).map(({ day, entries }) => (
            <DayGroup key={day} day={day} entries={entries} divider={divider} history={history} />
          ))}
        </ol>
      )}
    </div>
  );
}

function DayGroup({
  day,
  entries,
  divider,
  history,
}: {
  day: string;
  entries: HistoryEntry[];
  divider: number | undefined;
  history: BookingHistory;
}) {
  return (
    <>
      <li className="relative pt-3 pb-1 pl-[38px] sm:pl-[96px]" aria-hidden>
        <span className="label-caps bg-bg pr-2 text-[11px] text-mute">{day}</span>
      </li>
      {entries.map((e, i) => (
        <Row key={e.id} entry={e} index={i}>
          {e.id === divider && history.rebuiltOn && (
            <li className="relative py-2 pl-[38px] sm:pl-[96px]">
              <span className="inline-block rounded-chip bg-bg2 px-2.5 py-1 text-[12px] font-semibold text-mute">
                ↑ Rebuilt from records — the log started on {istFullDate(history.rebuiltOn)}; times
                marked ≈ are approximate
              </span>
            </li>
          )}
        </Row>
      ))}
    </>
  );
}

function Row({
  entry: e,
  index,
  children,
}: {
  entry: HistoryEntry;
  index: number;
  children?: React.ReactNode;
}) {
  const Icon = iconOf(e.kind);
  const diff = changes(e.before, e.after);
  return (
    <>
      <li
        className="animate-rise relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 py-1.5 sm:grid-cols-[70px_28px_minmax(0,1fr)] sm:gap-x-3"
        style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      >
        <time
          dateTime={e.at}
          className="num col-start-2 row-start-2 text-[11.5px] text-mute sm:col-start-1 sm:row-start-1 sm:pt-1 sm:text-right sm:text-[12px]"
        >
          {e.approx && (
            <span title="Approximate — rebuilt from the row's last update" aria-label="about">
              ≈{' '}
            </span>
          )}
          {istTime(e.at)}
        </time>
        <span
          aria-hidden
          className={cn(
            'relative z-[1] row-span-2 grid size-7 place-items-center rounded-full border sm:row-span-1',
            DOT[toneOf(e.kind)],
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 pt-1 text-[13.5px] text-ink2">
          <b className="mr-1 text-ink">{e.actorLabel}</b>
          <span className="break-words">{e.text}</span>
          {e.customerVisible && (
            <span
              className="ml-1.5 inline-flex translate-y-0.5 text-mute"
              title="The customer sees this on My trips"
            >
              <Eye className="size-3.5" aria-hidden />
              <span className="sr-only">(the customer sees this)</span>
            </span>
          )}
          {diff.length > 0 && (
            <span className="mt-0.5 block text-[12px] text-mute">{diff.join(' · ')}</span>
          )}
        </div>
      </li>
      {children}
    </>
  );
}
