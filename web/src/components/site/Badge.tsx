import type { components } from '@/lib/api-types';

export type BadgeValue = NonNullable<components['schemas']['PackageCard']['badge']>;

/** Labels mirror api `BADGE_LABELS` (schemas/meta.py); `GET /meta` is the runtime source if they drift. */
export const BADGE_LABEL: Record<BadgeValue, string> = {
  'filling-fast': 'Filling fast',
  'sold-out': 'Sold out',
  guaranteed: 'Guaranteed departure',
};

const TONE: Record<BadgeValue, string> = {
  'filling-fast': 'bg-warn-soft text-warn',
  'sold-out': 'bg-line text-ink2',
  guaranteed: 'bg-ok-soft text-ok',
};

export function Badge({ value }: { value: BadgeValue | null | undefined }) {
  if (!value) return null;
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2.5 py-1 text-xs font-bold leading-tight ${TONE[value]}`}
    >
      {BADGE_LABEL[value]}
    </span>
  );
}
