import { dealNotice } from '@/components/admin/packages/DealPanel';
import type { components } from '@/lib/api-types';
import { daysBetween } from '@/lib/account';
import { shortDate } from '@/lib/format';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** Packages B · Photo catalogue (R59, P20): pure helpers over `GET /admin/packages`. */
export type AdminPackageRow = components['schemas']['AdminPackageRow'];

export type HealthTone = 'ok' | 'warn' | 'bad' | 'info';
export type Health = { tone: HealthTone; word: string; why: string; action: string };

/** Seats left on the next date at or under this read as "Almost full". */
export const ALMOST_FULL = 2;
/** An empty next date is worth a look only this close: further out, it is just early. */
export const EMPTY_SOON_DAYS = 30;

/**
 * One word for how a package is doing, decided in order: can't go (or stay) live, a deal the
 * customer can't see, a next date nearly sold out, a next date nobody has booked, else healthy.
 * `action` is the one verb on the "Needs a look" row; every one opens the editor.
 */
export function health(p: AdminPackageRow, on: string = today()): Health {
  const failing = p.publishRules.filter((r) => !r.ok);
  if (failing.length) {
    const why = failing.map((r) => r.detail.toLowerCase()).join(', ');
    return p.status === 'live'
      ? { tone: 'bad', word: 'Needs a fix', why: `Live, but ${why}.`, action: 'Fix it' }
      : { tone: 'bad', word: 'Can’t publish', why: `Still to do: ${why}.`, action: 'Finish it' };
  }
  if (p.dealState === 'inactive') {
    return {
      tone: 'warn',
      word: 'Needs a fix',
      why: dealNotice(p)?.text ?? '',
      action: 'Fix the deal',
    };
  }
  const next = p.nextDeparture;
  if (p.status === 'draft')
    return {
      tone: 'info',
      word: 'Ready to publish',
      why: 'Every check passes.',
      action: 'Publish it',
    };
  if (next && next.seats - next.taken <= ALMOST_FULL) {
    const left = Math.max(0, next.seats - next.taken);
    return {
      tone: 'info',
      word: 'Almost full',
      why: `${shortDate(next.date)}: ${left} ${left === 1 ? 'seat' : 'seats'} left of ${next.seats}. Add seats or open another date.`,
      action: 'Add seats',
    };
  }
  if (next && next.taken === 0 && daysBetween(on, next.date) <= EMPTY_SOON_DAYS) {
    return {
      tone: 'info',
      word: 'No bookings yet',
      why: `Nobody on the next date, ${shortDate(next.date)}, yet.`,
      action: p.featured ? 'Open it' : 'Feature it',
    };
  }
  return { tone: 'ok', word: 'Healthy', why: '', action: 'Open it' };
}

export const needsLook = (p: AdminPackageRow) => health(p).tone !== 'ok';

export type Pill = 'all' | 'live' | 'draft' | 'featured' | 'look' | 'deal';
export const PILLS: readonly [Pill, string][] = [
  ['all', 'All'],
  ['live', 'Live'],
  ['draft', 'Draft'],
  ['featured', 'Featured'],
  ['look', 'Needs a look'],
  ['deal', 'Deal running'],
];

export function inPill(pill: Pill, p: AdminPackageRow): boolean {
  switch (pill) {
    case 'live':
    case 'draft':
      return p.status === pill;
    case 'featured':
      return p.featured;
    case 'look':
      return needsLook(p);
    case 'deal':
      return p.dealState === 'active';
    default:
      return true;
  }
}

export type Sort = 'next' | 'name' | 'enquiries' | 'emptiest';
export const SORTS: readonly [Sort, string][] = [
  ['next', 'Next departure'],
  ['name', 'Name'],
  ['enquiries', 'Enquiries'],
  ['emptiest', 'Emptiest first'],
];

const fill = (p: AdminPackageRow) =>
  p.nextDeparture && p.nextDeparture.seats ? p.nextDeparture.taken / p.nextDeparture.seats : 1;

export function sortRows(rows: readonly AdminPackageRow[], sort: Sort): AdminPackageRow[] {
  const out = rows.slice();
  const byName = (a: AdminPackageRow, b: AdminPackageRow) => a.name.localeCompare(b.name);
  if (sort === 'name') return out.sort(byName);
  if (sort === 'enquiries')
    return out.sort((a, b) => b.recentEnquiryCount - a.recentEnquiryCount || byName(a, b));
  if (sort === 'emptiest') return out.sort((a, b) => fill(a) - fill(b) || byName(a, b));
  // Next departure: soonest first, packages with no date last.
  const key = (p: AdminPackageRow) => p.nextDeparture?.date ?? '9999-12-31';
  return out.sort((a, b) => key(a).localeCompare(key(b)) || byName(a, b));
}

export function matches(
  p: AdminPackageRow,
  { pill, q, dest }: { pill: Pill; q: string; dest: string },
): boolean {
  const needle = q.trim().toLowerCase();
  return (
    inPill(pill, p) &&
    (!dest || p.destination.slug === dest) &&
    (!needle || `${p.name} ${p.destination.name}`.toLowerCase().includes(needle))
  );
}
