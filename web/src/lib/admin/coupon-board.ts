import type { components } from '@/lib/api-types';
import { daysBetween } from '@/lib/account';
import { formatDate, inr } from '@/lib/format';
import type { AdminCoupon, CouponState } from './coupon-schema';

/** Coupons B · Campaign board (R59, P20): pure helpers over `GET /admin/coupons`. */
export type CouponResults = components['schemas']['CouponResults'];
export type CouponUse = components['schemas']['CouponUse'];

export const COUPONS_PATH = '/admin/coupons';

/** `15 Oct 2026`: the date without the weekday. */
export const dmy = (iso: string) => formatDate(iso).slice(4);

/** A ticket this close to its last day, and still live or about to be, gets "Ends soon". */
export const ENDS_SOON_DAYS = 14;

/** Lanes by what a code is doing now, so a switch flip moves its ticket. */
export const LANES: readonly { title: string; states: readonly CouponState[]; hint: string }[] = [
  { title: 'Running now', states: ['active'], hint: 'customers can use these today' },
  { title: 'Starts later', states: ['scheduled'], hint: 'switched on, waiting for the start date' },
  { title: 'Paused', states: ['paused'], hint: 'switched off by you' },
  { title: 'Ended', states: ['used_up', 'expired'], hint: 'past the last day or out of uses' },
];

export function lanes(items: readonly AdminCoupon[]) {
  return LANES.map((lane) => ({
    ...lane,
    items: items.filter((c) => lane.states.includes(c.state)),
  })).filter((lane) => lane.items.length > 0);
}

export function boardHref(sel?: string): string {
  return sel ? `${COUPONS_PATH}?sel=${encodeURIComponent(sel)}` : COUPONS_PATH;
}

export function parseSel(sp: Record<string, string | string[] | undefined>): string | undefined {
  const v = Array.isArray(sp.sel) ? sp.sel[0] : sp.sel;
  return v?.trim() ? v.trim().slice(0, 64) : undefined;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The ticket's footer line: when it opens, ends or ended. `today` is the IST business day. */
export function when(c: AdminCoupon, today: string): string {
  switch (c.state) {
    case 'scheduled':
      return `Opens in ${plural(daysBetween(today, c.startsOn), 'day')} · ${dmy(c.startsOn)}`;
    case 'expired':
      return `Ended ${dmy(c.endsOn ?? c.startsOn)}`;
    case 'used_up':
      return `All ${c.useLimit} uses taken`;
    default:
      if (!c.endsOn) return 'No end date';
      return `Ends ${dmy(c.endsOn)} · ${plural(Math.max(0, daysBetween(today, c.endsOn)), 'day')} left`;
  }
}

export function endsSoon(c: AdminCoupon, today: string): boolean {
  return (
    !!c.endsOn &&
    (c.state === 'active' || c.state === 'scheduled') &&
    daysBetween(today, c.endsOn) <= ENDS_SOON_DAYS
  );
}

/** Bookings value per ₹1 given back — `₹27` — or a dash before the first use. */
export function perRupee(c: Pick<AdminCoupon, 'givenPaise' | 'bookedPaise'>): string {
  return c.givenPaise > 0 ? inr(Math.round(c.bookedPaise / c.givenPaise) * 100) : '—';
}

/** The uses meter, in percent of the limit: captured uses, then live holds shaded after them. */
export function meter(c: Pick<AdminCoupon, 'uses' | 'liveHolds' | 'useLimit'>) {
  if (!c.useLimit) return null;
  const pct = (n: number) => Math.min(100, Math.round((n / c.useLimit!) * 100));
  const used = pct(c.uses);
  return { used, held: Math.min(100 - used, pct(c.liveHolds)) };
}

/** The dark return band: every code, all time — ₹ given back against what those bookings paid,
 *  and the discount as a share of what the trips list at (paid + given). */
export function returnBand(items: readonly AdminCoupon[]) {
  const given = items.reduce((n, c) => n + c.givenPaise, 0);
  const booked = items.reduce((n, c) => n + c.bookedPaise, 0);
  const uses = items.reduce((n, c) => n + c.uses, 0);
  const share = given + booked > 0 ? (given / (given + booked)) * 100 : 0;
  return { given, booked, uses, share: Math.round(share * 10) / 10 };
}

export type Look = { tone: 'info' | 'warn' | 'mute'; label: string; code: string; text: string };

/** "Needs a look": checkouts holding a use now, codes out of uses, and codes you paused. */
export function needsLook(items: readonly AdminCoupon[]): Look[] {
  const out: Look[] = [];
  for (const c of items) {
    if (c.liveHolds)
      out.push({
        tone: 'info',
        label: 'In checkout',
        code: c.code,
        text: `${plural(c.liveHolds, 'checkout')} holding a use right now`,
      });
    if (c.state === 'used_up')
      out.push({
        tone: 'warn',
        label: 'Used up',
        code: c.code,
        text: `took all ${c.useLimit} uses · raise the limit to keep it going`,
      });
    if (c.state === 'paused')
      out.push({
        tone: 'mute',
        label: 'Paused',
        code: c.code,
        text: `${c.uses} used${c.useLimit ? `, ${Math.max(0, c.useLimit - c.uses)} left` : ''} when you switch it on`,
      });
  }
  return out;
}

/** The weekly sparkline as SVG points in a `w`×`h` box (a flat line when there were no uses). */
export function sparkPoints(weekly: readonly number[], w = 112, h = 30): string {
  if (weekly.length < 2) return '';
  const max = Math.max(1, ...weekly);
  const step = w / (weekly.length - 1);
  return weekly
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 6)).toFixed(1)}`)
    .join(' ');
}

export const tripsLabel = (c: Pick<AdminCoupon, 'allPackages' | 'packages'>) =>
  c.allPackages ? 'Every package' : c.packages.map((p) => p.name).join(', ');

export const datesLabel = (c: Pick<AdminCoupon, 'startsOn' | 'endsOn'>) =>
  c.endsOn ? `${dmy(c.startsOn)} – ${dmy(c.endsOn)}` : `From ${dmy(c.startsOn)}, no end`;
