import { MONTHS, monthRange } from '@/lib/format';

/**
 * Twelve chips, the best months lit and rising in one after another (the page's motion note);
 * the caption carries the same information for screen readers and reduced motion.
 */
export function BestMonths({ months }: { months: number[] }) {
  const best = new Set(months);
  let lit = 0;
  return (
    <div>
      <p className="mb-3 text-ink2">
        Best <b className="text-ink">{monthRange(months)}</b> — the months we run every departure
        with confidence.
      </p>
      <ol aria-hidden className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {MONTHS.map((name, i) => {
          const on = best.has(i + 1);
          const delay = on ? `${lit++ * 70}ms` : undefined;
          return (
            <li
              key={name}
              className={`num rounded-chip py-1.5 text-center text-xs font-bold ${
                on ? 'animate-rise bg-primary text-white' : 'bg-bg2 text-mute'
              }`}
              style={{ animationDelay: delay }}
            >
              {name}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
