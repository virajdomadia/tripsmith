import type { components } from '@/lib/api-types';
import { addDays } from '@/lib/booking';
import { afterDeal, type Deal } from '@/lib/deal';
import { inr, shortDate } from '@/lib/format';

export type EarlyBird = components['schemas']['EarlyBirdOut'];
export type LadderRung = components['schemas']['LadderRung'];

/** The tier a booking made on IST `today` earns for a departure on `date` (api `pricing.py`). */
export type Tier = { tier: number; days: number; offPaise: number; bookBy: string };

/**
 * The furthest-out tier the booking day still reaches: booked on or before departure − N days,
 * counted in IST. Tiers never add up. Callers pass the visitor's `istToday()` on the client,
 * so a label flips at IST midnight even on a prerendered page.
 */
export function tierFor(
  eb: EarlyBird | null | undefined,
  date: string,
  today: string,
): Tier | null {
  for (const [i, t] of (eb?.tiers ?? []).entries()) {
    const bookBy = addDays(date, -t.days);
    if (today <= bookBy) return { tier: i + 1, days: t.days, offPaise: t.offPaise, bookBy };
  }
  return null;
}

/** `Early bird −₹1,500 · book by 14 Nov` */
export const tierLabel = (t: Tier) =>
  `Early bird −${inr(t.offPaise)} · book by ${shortDate(t.bookBy)}`;

/**
 * One traveller's double-sharing price on a date after the deal and the early-bird, the order
 * the quote applies: the deal first (never more than the price), then the tier on what is left,
 * never below ₹1. Unpriced (0) stays 0.
 */
export function afterDiscounts(paise: number, deal: Deal | null | undefined, tier: Tier | null) {
  const dealt = afterDeal(paise, deal);
  if (!tier || paise <= 0) return dealt;
  return dealt - Math.min(tier.offPaise, Math.max(0, dealt - 100));
}
