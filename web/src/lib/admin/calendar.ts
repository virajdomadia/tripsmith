import type { components } from '@/lib/api-types';

/**
 * The owner's departure calendar (R50, P11) — pure helpers shared by the server page and the
 * client board: month maths on plain `YYYY-MM-DD` strings (IST days, no time zones), the fill
 * state of a chip, the filters in the URL, the month strip's sums and "Needs you".
 */

export type CalendarMonth = components['schemas']['CalendarMonth'];
export type CalendarDeparture = components['schemas']['CalendarDeparture'];
export type CalendarPackage = components['schemas']['CalendarPackage'];
export type CalendarPanel = components['schemas']['CalendarPanel'];
export type LeaderTrip = components['schemas']['BusyLeaderTrip'];
export type CalendarLeader = components['schemas']['LeaderRef'];

export const CALENDAR_PATH = '/admin/calendar';
/** A day cell shows this many chips; the rest fold into "+N more". */
export const CELL_CHIPS = 3;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const MON = MONTHS.map((m) => m.slice(0, 3));

// --- days ---------------------------------------------------------------------------------------

const MONTH_RE = /^20[2-9]\d-(0[1-9]|1[0-2])$/;
const ID_RE = /^[a-z0-9]{1,40}$/i;

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const asIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return asIso(d);
}

export const daysBetween = (a: string, b: string) =>
  Math.round((asDate(b).getTime() - asDate(a).getTime()) / 864e5);

export const weekday = (iso: string) => asDate(iso).getUTCDay();
export const dayOf = (iso: string) => Number(iso.slice(8, 10));
export const monthOfDay = (iso: string) => iso.slice(0, 7);

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return asIso(d).slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1]!;

/** "Fri 6 Nov" */
export function dayLabel(iso: string): string {
  return `${WEEKDAYS[weekday(iso)]} ${dayOf(iso)} ${MON[Number(iso.slice(5, 7)) - 1]}`;
}

/** The month's weeks, Sunday first, padded with the neighbouring months' days. */
export function weeksOf(month: string): string[][] {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const out: string[][] = [];
  for (let s = addDays(first, -weekday(first)); s <= last; s = addDays(s, 7)) {
    out.push(Array.from({ length: 7 }, (_, i) => addDays(s, i)));
  }
  return out;
}

// --- a chip -------------------------------------------------------------------------------------

export type Fill = 'full' | 'hot' | 'open' | 'low';
export const FILL_LABEL: Record<Fill, string> = {
  full: 'Sold out',
  hot: 'Filling',
  open: 'Open',
  low: 'Low',
};

/** Coloured by (sold + held) ÷ seats: sold out when nothing is free, filling at 70 %+, open at
 *  35 %+, low below. */
export function fillOf(d: Pick<CalendarDeparture, 'sold' | 'held' | 'free' | 'seatsTotal'>): Fill {
  if (d.free <= 0) return 'full';
  const taken = (d.sold + d.held) / Math.max(1, d.seatsTotal);
  if (taken >= 0.7) return 'hot';
  if (taken >= 0.35) return 'open';
  return 'low';
}

export const pct = (n: number, of: number) => (of > 0 ? Math.min(100, (n / of) * 100) : 0);

/** Free seats a waiting party fits — the panel's "Offer seats" has someone to offer to. */
export const canOffer = (d: CalendarDeparture) =>
  d.free > 0 && d.smallestWaitingParty !== null && d.smallestWaitingParty <= d.free;

export function chipLabel(d: CalendarDeparture, pkg: string): string {
  const parts = [
    `${pkg}, ${dayLabel(d.date)}, ${FILL_LABEL[fillOf(d)]}`,
    `${d.sold} of ${d.seatsTotal} sold, ${d.held} held, ${d.free} free`,
  ];
  if (d.waiting) parts.push(`${d.waiting} on the waitlist`);
  return parts.join(': ');
}

// --- the URL ------------------------------------------------------------------------------------

export type CalendarFilters = { dest: string; pkg: string; leader: string };
export type CalendarParams = CalendarFilters & { month: string | null; dep: string | null };

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const id = (v: string | string[] | undefined) => (ID_RE.test(one(v)) ? one(v) : '');

export function parseCalendarParams(raw: Raw): CalendarParams {
  const month = one(raw.month);
  return {
    month: MONTH_RE.test(month) ? month : null,
    dep: id(raw.dep) || null,
    dest: id(raw.dest),
    pkg: id(raw.package),
    leader: id(raw.leader),
  };
}

export function calendarHref(p: Partial<CalendarParams>): string {
  const q = new URLSearchParams();
  if (p.month) q.set('month', p.month);
  if (p.dest) q.set('dest', p.dest);
  if (p.pkg) q.set('package', p.pkg);
  if (p.leader) q.set('leader', p.leader);
  if (p.dep) q.set('dep', p.dep);
  const s = q.toString();
  return s ? `${CALENDAR_PATH}?${s}` : CALENDAR_PATH;
}

export function shown(
  deps: readonly CalendarDeparture[],
  packages: readonly CalendarPackage[],
  f: CalendarFilters,
): CalendarDeparture[] {
  const byId = new Map(packages.map((p) => [p.id, p]));
  return deps.filter(
    (d) =>
      (!f.dest || byId.get(d.packageId)?.destinationId === f.dest) &&
      (!f.pkg || d.packageId === f.pkg) &&
      (!f.leader || d.leaderId === f.leader),
  );
}

// --- the strip ----------------------------------------------------------------------------------

export type Strip = {
  departures: number;
  soldOut: number;
  seats: number;
  sold: number;
  held: number;
  soldPercent: number;
  revenuePaise: number;
  collectedPaise: number;
  balancePaise: number;
  balanceBookings: number;
  firstDueOn: string | null;
  missing: number;
  missingDepartures: number;
};

/** The month strip over what the filters show — the same sums as the desk CSV. */
export function stripOf(deps: readonly CalendarDeparture[]): Strip {
  const sum = (f: (d: CalendarDeparture) => number) => deps.reduce((n, d) => n + f(d), 0);
  const seats = sum((d) => d.seatsTotal);
  const sold = sum((d) => d.sold);
  const dues = deps.map((d) => d.firstDueOn).filter((x): x is string => Boolean(x));
  return {
    departures: deps.length,
    soldOut: deps.filter((d) => d.free <= 0).length,
    seats,
    sold,
    held: sum((d) => d.held),
    soldPercent: seats ? Math.round((sold / seats) * 100) : 0,
    revenuePaise: sum((d) => d.revenuePaise),
    collectedPaise: sum((d) => d.collectedPaise),
    balancePaise: sum((d) => d.balancePaise),
    balanceBookings: sum((d) => d.balanceBookings),
    firstDueOn: dues.length ? dues.sort()[0]! : null,
    missing: sum((d) => d.missingTravellers),
    missingDepartures: deps.filter((d) => d.missingTravellers > 0).length,
  };
}

// --- "Needs you" ----------------------------------------------------------------------------------

export type Need = { tone: 'ok' | 'bad' | 'warn'; text: string };

/** Why a departure wants the owner this month, most useful first. Past dates need nothing. */
export function needsOf(d: CalendarDeparture, today: string): Need[] {
  if (d.date < today) return [];
  const out: Need[] = [];
  const out_ = daysBetween(today, d.date);
  if (canOffer(d)) out.push({ tone: 'ok', text: 'Waitlist fits the free seats' });
  if (fillOf(d) === 'low' && out_ <= 70)
    out.push({ tone: 'bad', text: `Low fill · ${out_} days out` });
  if (d.missingTravellers)
    out.push({ tone: 'warn', text: `Details missing · ${d.missingTravellers}` });
  if (d.balancePaise && d.firstDueOn && daysBetween(today, d.firstDueOn) <= 14) {
    out.push({ tone: 'warn', text: `Balance due ${dayLabel(d.firstDueOn)}` });
  }
  return out;
}

// --- the add form -------------------------------------------------------------------------------

/** The trip a leader is already on over [start, start + nights] (the return day counts). */
export function busyTrip(
  trips: readonly LeaderTrip[],
  leaderId: string,
  start: string,
  nights: number,
): LeaderTrip | undefined {
  const end = addDays(start, nights);
  return trips.find((t) => t.leaderId === leaderId && t.date <= end && start <= t.returns);
}
