import type { components } from '@/lib/api-types';

export type BadgeValue = NonNullable<components['schemas']['PackageCard']['badge']>;

/** Labels mirror api `BADGE_LABELS` (schemas/meta.py); `GET /meta` is the runtime source if they drift. */
export const BADGE_LABEL: Record<BadgeValue, string> = {
  'filling-fast': 'Filling fast',
  'sold-out': 'Sold out',
  'likely-to-sell-out': 'Likely to sell out',
  guaranteed: 'Guaranteed departure',
};

const TONE: Record<BadgeValue, string> = {
  'filling-fast': 'bg-warn-soft text-warn',
  'sold-out': 'bg-line text-ink2',
  'likely-to-sell-out': 'bg-primary-soft text-primary-ink',
  guaranteed: 'bg-ok-soft text-ok',
};

/** "Filling fast · 3 left" when the seats are passed (P2, R40): the exact count, never "few". */
export function badgeText(value: BadgeValue, seatsLeft?: number | null): string {
  if (value === 'filling-fast' && seatsLeft != null && seatsLeft > 0)
    return `${BADGE_LABEL[value]} · ${seatsLeft} left`;
  return BADGE_LABEL[value];
}

export function Badge({
  value,
  seatsLeft,
}: {
  value: BadgeValue | null | undefined;
  seatsLeft?: number | null;
}) {
  if (!value) return null;
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2.5 py-1 text-xs font-bold leading-tight whitespace-nowrap ${TONE[value]}`}
    >
      {badgeText(value, seatsLeft)}
    </span>
  );
}
