'use client';

import { MONTHS } from '@/lib/admin/destination-schema';
import { cn } from '@/lib/utils';

type Props = { value: number[]; onChange: (months: number[]) => void; id?: string };

/** Twelve toggle chips (the mockup's `.status-sel`); order is normalised by the schema. */
export function MonthPicker({ value, onChange, id }: Props) {
  const toggle = (m: number) =>
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  return (
    <div id={id} role="group" aria-label="Best months" className="flex flex-wrap gap-1.5">
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
