'use client';

import { MONTHS } from '@/lib/admin/destination-schema';
import { cn } from '@/lib/utils';

type Props = {
  value: number[];
  onChange: (months: number[]) => void;
  id?: string;
  /** Forwarded by shadcn's `<FormControl>` Slot (see `DestinationForm`'s comment for why a
   *  role="group" needs these spelled out instead of relying on the Slot's usual target).
   *  No `aria-invalid` here: `role="group"` doesn't support it (jsx-a11y correctly flags it) —
   *  the error is conveyed by this pointing at the field's `FormMessage` instead. */
  'aria-describedby'?: string;
  /** Not Slot-forwarded (only id/aria-describedby are) — the caller passes the FormLabel's id
   *  explicitly, since a `<label htmlFor>` cannot label a role="group". Kept alongside the
   *  static `aria-label` below, which is just the fallback for a caller that passes no id. */
  'aria-labelledby'?: string;
};

/** Twelve toggle chips (the mockup's `.status-sel`); order is normalised by the schema. */
export function MonthPicker({
  value,
  onChange,
  id,
  'aria-describedby': describedBy,
  'aria-labelledby': labelledBy,
}: Props) {
  const toggle = (m: number) =>
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  return (
    <div
      id={id}
      role="group"
      aria-label="Best months"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-1.5"
    >
      {MONTHS.map((m) => {
        const on = value.includes(m.value);
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(m.value)}
            className={cn(
              'rounded-chip border-[1.5px] border-line bg-bg px-3 py-1 text-[13px] font-semibold text-ink2 transition-colors hover:border-ink',
              on && 'border-primary bg-primary-soft text-primary-ink',
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
