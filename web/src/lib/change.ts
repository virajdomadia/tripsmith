import type { components } from '@/lib/api-types';
import { formatDate, inr } from '@/lib/format';

export type ChangeOffer = components['schemas']['ChangeOffer'];
export type ChangeOptions = components['schemas']['ChangeOptions'];
export type ChangeOption = components['schemas']['ChangeOption'];
export type ChangeResult = components['schemas']['ChangeResult'];

/**
 * Change date (R45, P7) — the words the My trips card and the date sheet show. Every amount is
 * the server's; nothing here prices anything.
 */

/** "Free until Wed 14 Oct · ₹1,000 per traveller to Thu 29 Oct · after that, WhatsApp us". */
export function feeRule(offer: ChangeOffer): string {
  const free = `Free until ${formatDate(offer.freeUntil)}`;
  const paid = `₹1,000 per traveller until ${formatDate(offer.lastDay)}`;
  if (offer.feePerTravellerPaise === 0) return `${free}. Then ${paid}; after that, WhatsApp us.`;
  if (offer.feePerTravellerPaise) return `${paid} — after that, WhatsApp us.`;
  return 'Online changes have closed — WhatsApp us and we’ll see what we can do.';
}

/** The price chip on a date: same fare, +₹X or −₹X against the current fare (fee aside). */
export function differenceLabel(o: Pick<ChangeOption, 'differencePaise'>): string {
  if (o.differencePaise === 0) return 'Same fare';
  return `${o.differencePaise > 0 ? '+' : '−'}${inr(Math.abs(o.differencePaise))}`;
}

export function seatsLabel(o: Pick<ChangeOption, 'seatsLeft' | 'bookable' | 'unbookable'>): string {
  if (o.unbookable === 'on_request') return 'On request';
  if (!o.bookable) return 'Sold out for your party';
  return o.seatsLeft <= 4 ? `${o.seatsLeft} left` : `${o.seatsLeft} seats`;
}

/** What the move means for the customer's money, in one line. */
export function moneyLine(o: ChangeOption): string {
  if (o.payNowPaise > 0) return `Pay ${inr(o.payNowPaise)} now`;
  if (o.refundPaise > 0) return `${inr(o.refundPaise)} back to you`;
  if (o.balancePaise > 0 && o.netPaise < 0)
    return `${inr(-o.netPaise)} off your balance — nothing to pay now`;
  return 'Nothing to pay';
}

/** The sheet's primary button. */
export function confirmLabel(o: ChangeOption): string {
  const to = `Move to ${formatDate(o.date)}`;
  return o.payNowPaise > 0 ? `${to} · Pay ${inr(o.payNowPaise)}` : to;
}

export const changeOptionsPath = (ref: string) =>
  `/api/account/bookings/${encodeURIComponent(ref)}/change`;
