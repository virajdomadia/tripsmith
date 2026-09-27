import type { components } from '@/lib/api-types';
import { inr, MONTHS } from '@/lib/format';

/** Dashboard C · Money desk (R59, P20): pure helpers over `GET /admin/money`. */
export type MoneyDesk = components['schemas']['MoneyDesk'];
export type MoneyDay = components['schemas']['MoneyDay'];
export type MoneyLine = components['schemas']['MoneyLine'];

/** `₹6.84 L` from ₹1 lakh up, `₹84,250` below — the equation's big numbers. */
export function lakh(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (Math.abs(rupees) < 1_00_000) return inr(paise);
  const l = Math.abs(rupees) / 1_00_000;
  const digits = l >= 100 ? l.toFixed(0) : l.toFixed(2).replace(/\.?0+$/, '');
  return `${rupees < 0 ? '−' : ''}₹${digits} L`;
}

/** Collected − refunds (sent and still to send) [+ live holds] = kept. */
export function equation(m: MoneyDesk, countHolds: boolean) {
  const refunds = m.refundedPaise + m.toRecordPaise;
  const holds = countHolds ? m.holdsPaise : 0;
  return { collected: m.collectedPaise, refunds, holds, kept: m.collectedPaise - refunds + holds };
}

/** Bar heights in px for one day, scaled against the busiest day in the window (never 0 for a
 *  non-zero amount, so a small payment still shows). */
export function scale(days: readonly MoneyDay[], up: number, down: number) {
  const maxIn = Math.max(1, ...days.map((d) => d.inPaise));
  const maxOut = Math.max(1, ...days.map((d) => d.outPaise + d.owePaise));
  const px = (v: number, max: number, h: number) => (v > 0 ? Math.max(2, (v / max) * h) : 0);
  return (d: MoneyDay) => ({
    in: px(d.inPaise, maxIn, up),
    out: px(d.outPaise, maxOut, down),
    owe: px(d.owePaise, maxOut, down),
  });
}

/** `1 Sep` on the 1st, `5`, `10`… on every fifth day, nothing between — the axis labels. */
export function tick(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (d === 1) return `1 ${MONTHS[m - 1]}`;
  return d % 5 === 0 ? String(d) : '';
}

export const LINE_WORD = { in: 'Collected', out: 'Refunded', owe: 'To send' } as const;

export function net(lines: readonly MoneyLine[]): number {
  return lines.reduce((s, l) => s + (l.kind === 'in' ? l.amountPaise : -l.amountPaise), 0);
}
