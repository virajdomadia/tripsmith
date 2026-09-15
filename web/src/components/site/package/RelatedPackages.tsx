import { PackageCard } from '@/components/site/PackageCard';
import type { components } from '@/lib/api-types';

type Card = components['schemas']['PackageCard'];

export function RelatedPackages({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="related-title" className="mt-16">
      <h2 id="related-title" className="mb-5 text-[clamp(26px,3.2vw,38px)]">
        More trips like this
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <PackageCard key={c.slug} card={c} />
        ))}
      </div>
    </section>
  );
}
