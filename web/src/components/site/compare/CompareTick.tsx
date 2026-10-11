'use client';

import { inTray, MAX_COMPARE, toggleCompare, type TrayItem, useCompareTray } from '@/lib/compare';
import { toast } from '@/lib/saved';

type Variant = 'card' | 'hero' | 'row';

const LOOK: Record<Variant, string> = {
  // On a card photo, beside the ♡ (the stamps own the top-right).
  card: 'h-11 rounded-full bg-white/94 px-3.5 text-[13px] text-ink shadow-[0_6px_16px_-8px_rgb(0_0_0/0.45)] hover:bg-white',
  // The package hero, with Save and Share.
  hero: 'h-9 rounded-btn bg-white/94 px-3 text-[13px] text-ink [text-shadow:none] hover:bg-white',
  // My trips · Saved.
  row: 'h-11 rounded-btn border-[1.5px] border-line px-3 text-[13px] text-ink hover:border-ink',
};

/**
 * "Compare" (R39, P1b): adds the trip to the compare tray, up to three. A checkbox in role and
 * state (`aria-checked`), so screen readers hear "Compare <trip>, checkbox, checked". A fourth
 * is refused with a toast and the tray shakes — nothing is swapped out without asking.
 */
export function CompareTick({ item, variant }: { item: TrayItem; variant: Variant }) {
  const on = inTray(useCompareTray(), item.slug);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={`Compare ${item.name}`}
      onClick={() => {
        if (toggleCompare(item) === 'full')
          toast({ text: `Compare holds ${MAX_COMPARE} — remove one first` });
      }}
      className={`inline-flex items-center gap-1.5 font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${LOOK[variant]}`}
    >
      <span
        aria-hidden
        className={`grid size-4 place-items-center rounded-[5px] border-[1.5px] ${
          on ? 'border-primary bg-primary text-white' : 'border-current'
        }`}
      >
        {on && (
          <svg viewBox="0 0 16 16" className="size-3">
            <path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      Compare
    </button>
  );
}
