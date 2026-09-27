import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';

/** A booking's history (R54, P16): the desk's merged timeline and My trips' "Activity". */
export type HistoryEntry = components['schemas']['HistoryEntry'];
export type BookingHistory = components['schemas']['BookingHistory'];
export type ActivityEntry = components['schemas']['ActivityEntry'];
export type HistoryGroup = HistoryEntry['group'];
export type Chip = 'all' | HistoryGroup;
export type EntryTone = 'ok' | 'bad' | 'warn' | 'primary' | 'mute';

export const CHIPS: readonly { key: Chip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'booking', label: 'Booking' },
  { key: 'payment', label: 'Payments' },
  { key: 'email', label: 'Emails' },
];

export function countByChip(entries: readonly { group: HistoryGroup }[]): Record<Chip, number> {
  const out: Record<Chip, number> = { all: entries.length, booking: 0, payment: 0, email: 0 };
  for (const e of entries) out[e.group] += 1;
  return out;
}

/** Consecutive entries on the same day (as `dayOf` names it), oldest first — the list is
 *  already ordered by the api. */
export function byDay<T extends { at: string }>(
  entries: readonly T[],
  dayOf: (iso: string) => string,
): { day: string; entries: T[] }[] {
  const days: { day: string; entries: T[] }[] = [];
  for (const e of entries) {
    const day = dayOf(e.at);
    const last = days.at(-1);
    if (last?.day === day) last.entries.push(e);
    else days.push({ day, entries: [e] });
  }
  return days;
}

const FIELD: Record<string, { label: string; show: (v: unknown) => string }> = {
  status: { label: 'Status', show: (v) => String(v).replace('_', ' ') },
  cancelReason: { label: 'Reason', show: (v) => String(v).replaceAll('_', ' ') },
  paidPaise: { label: 'Paid', show: (v) => inr(Number(v)) },
  totalPaise: { label: 'Total', show: (v) => inr(Number(v)) },
  refundPaise: { label: 'Refund', show: (v) => inr(Number(v)) },
  refundNeeded: { label: 'Refund needed', show: (v) => (v ? 'yes' : 'no') },
  review: { label: 'Review', show: (v) => String(v) },
};

/** "Status: pending → confirmed" for each value an entry changed. Nothing without a `before`:
 *  an entry that only records where things ended (a new booking) says it in its text. */
export function changes(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] {
  if (!before || !after) return [];
  return Object.keys(after)
    .filter((k) => k in before && before[k] !== after[k])
    .map((k) => {
      const f = FIELD[k] ?? { label: k, show: (v: unknown) => String(v) };
      return `${f.label}: ${f.show(before[k])} → ${f.show(after[k])}`;
    });
}

/** The dot's colour: money in is good news, anything cancelled, failed or owed is not. */
export function toneOf(kind: string): EntryTone {
  if (/failed|error|seats_gone|flagged|expired|released|undone|rejected|hidden/.test(kind)) {
    return /^(payment|email|refund)\.(failed|error|flagged)$/.test(kind) ? 'bad' : 'warn';
  }
  if (kind === 'booked') return 'primary';
  if (
    /payment\.(captured|offline)|refund\.(recorded|processed)|approved|published|completed/.test(
      kind,
    )
  ) {
    return 'ok';
  }
  return 'mute';
}
