import type { components } from '@/lib/api-types';
import { shortDate } from '@/lib/format';

export type Deal = components['schemas']['DealOut'];

/** The corner label: the owner's words, or "Deal" when they left it blank (03 R20). */
export const dealLabel = (deal: Deal) => deal.label || 'Deal';

/** `Ends 2 Oct` — the last IST day the deal runs. */
export const dealEnds = (deal: Deal) => `Ends ${shortDate(deal.endsOn)}`;

/**
 * One traveller's price on a departure with the deal taken off: the flat amount, never more
 * than the price itself — the rule the quote applies (api `booking/pricing.py`). Unpriced (0,
 * "on request") stays 0; no deal = the price unchanged.
 */
export const afterDeal = (paise: number, deal: Deal | null | undefined) =>
  deal && paise > 0 ? paise - Math.min(deal.offPaise, paise) : paise;

/** The "from" price a visitor sees: the deal's while one runs, else the starting price. */
export const shownPrice = (p: { startingPricePaise: number; deal?: Deal | null }) =>
  p.deal ? p.deal.pricePaise : p.startingPricePaise;
