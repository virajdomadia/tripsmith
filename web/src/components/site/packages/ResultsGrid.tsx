import { PackageCard } from '@/components/site/PackageCard';
import type { components } from '@/lib/api-types';

type Card = components['schemas']['PackageCard'];

/**
 * Two-up beside the filter rail (S4 `.listing .cards`). Each card rises in, staggered 60 ms —
 * the page re-keys this grid per query, so every result change plays it again.
 */
export function ResultsGrid({ items }: { items: Card[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {items.map((card, i) => (
        <li
          key={card.slug}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
        >
          <PackageCard card={card} />
        </li>
      ))}
    </ul>
  );
}
