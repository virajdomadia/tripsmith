import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { Trend } from '@/lib/admin/dashboard';

const TONE = {
  up: 'text-ok',
  down: 'text-warn',
  flat: 'text-mute',
} as const;

const ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/**
 * Mockup A2 `.tile`: caption, the number, one line underneath. The hint is either a `Trend`
 * (arrow + colour) or a plain string for facts that have no direction, like how long the
 * oldest enquiry has waited.
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: Trend | string;
}) {
  const trend = typeof hint === 'string' ? null : hint;
  const Icon = trend ? ICON[trend.direction] : null;
  return (
    <div className="rounded-card border border-line bg-bg p-4">
      <small className="label-caps text-mute">{label}</small>
      <b className="num mt-1 block text-[30px] leading-none">{value.toLocaleString('en-IN')}</b>
      <span
        className={`mt-2 flex items-center gap-1.5 text-[13px] font-semibold ${trend ? TONE[trend.direction] : 'text-mute'}`}
      >
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {typeof hint === 'string' ? hint : hint.label}
      </span>
    </div>
  );
}
