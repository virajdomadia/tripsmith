import type { components } from '@/lib/api-types';

/**
 * P2 (R40): the words for what real bookings say about a trip. The api sends a fact only past
 * its threshold (`services/catalog/urgency.py`) — so nothing here invents a label.
 */
export type BookingProof = components['schemas']['BookingProof'];

export const bookedRecently = (n: number) => `Booked ${n}× in the last 30 days`;

/** `0` → "Booked today", `1` → "Booked yesterday", `3` → "Last booked 3 days ago". */
export function lastBooked(days: number): string {
  if (days <= 0) return 'Booked today';
  if (days === 1) return 'Booked yesterday';
  return `Last booked ${days} days ago`;
}

/**
 * `both`: the package page, one line with each fact ("Booked 5× in the last 30 days · last
 * booked 2 days ago"). `one`: cards and compare — "Booked N×" wins over "Last booked".
 */
export function proofLine(
  proof: BookingProof | null | undefined,
  mode: 'one' | 'both' = 'one',
): string | null {
  if (!proof) return null;
  const { recentBookings: recent, lastBookedDays: last } = proof;
  if (recent == null) return last == null ? null : lastBooked(last);
  if (mode === 'one' || last == null) return bookedRecently(recent);
  const tail = lastBooked(last);
  return `${bookedRecently(recent)} · ${tail[0].toLowerCase()}${tail.slice(1)}`;
}

/** P4 (R42): "with 3 others" from the booking's party; nothing for a solo traveller. */
export function withOthers(party: number): string | null {
  const others = party - 1;
  if (others <= 0) return null;
  return others === 1 ? 'with 1 other' : `with ${others} others`;
}
