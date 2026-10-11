'use client';

import { useState } from 'react';
import { isSaved, toggleSaved, useSaved } from '@/lib/saved';

type Variant = 'card' | 'hero' | 'bar';

const LOOK: Record<Variant, string> = {
  // On a card photo: a round chip over the top-left corner (the stamps own the top-right).
  card: 'size-10 justify-center rounded-full bg-white/94 text-ink shadow-[0_6px_16px_-8px_rgb(0_0_0/0.45)] hover:bg-white',
  // The package hero, beside Share: the same chip as ShareButtons.
  hero: 'h-9 gap-1.5 rounded-btn bg-white/94 px-3 text-[13px] font-bold text-ink [text-shadow:none] hover:bg-white',
  // The phone's sticky Book bar: the bar's outlined icon buttons.
  bar: 'h-11 justify-center rounded-btn border-[1.5px] border-line px-3 text-ink hover:border-ink',
};

/**
 * The ♡ (R39, P1): saves a trip — to the account when signed in, else to this browser. Its own
 * button, never inside a card's link (a button nested in an `<a>` is invalid and steals the
 * link's click). Optimistic; `lib/saved.ts` rolls it back with a toast when the api refuses.
 */
export function SaveHeart({
  slug,
  name,
  variant,
  className = '',
  onToggled,
}: {
  slug: string;
  name: string;
  variant: Variant;
  className?: string;
  /** Called with the new state once the save store has settled it. */
  onToggled?: (saved: boolean) => void;
}) {
  const saved = isSaved(useSaved(), slug);
  const [pop, setPop] = useState(0);

  async function onClick() {
    if (!saved) setPop((n) => n + 1);
    const now = await toggleSaved(slug, name);
    if (now !== saved) onToggled?.(now);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={variant === 'hero' ? undefined : `Save ${name}`}
      title={saved ? 'Saved — tap to remove' : 'Save this trip'}
      className={`relative inline-flex items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${LOOK[variant]} ${className}`}
    >
      <span className="relative grid place-items-center">
        {pop > 0 && saved && (
          <span
            key={`ring-${pop}`}
            aria-hidden
            className="animate-heart-ring absolute size-6 rounded-full border-2 border-bad"
          />
        )}
        <svg
          key={`heart-${pop}`}
          viewBox="0 0 24 24"
          aria-hidden
          className={`size-5 ${saved ? 'text-bad' : ''} ${pop > 0 && saved ? 'animate-heart-pop' : ''}`}
        >
          <path
            d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.6 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z"
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {variant === 'hero' && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
