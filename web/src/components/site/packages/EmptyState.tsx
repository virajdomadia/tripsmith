import { PackageCard } from '@/components/site/PackageCard';
import type { components } from '@/lib/api-types';
import { isFiltered, monthLabel, type SearchQuery } from '@/lib/search';
import { NavLink } from './SearchTransition';

type Card = components['schemas']['PackageCard'];

/** S4b: say what went wrong, offer one click out, show three trips anyway. ("Ask us for options" arrives with the enquiry form, F9.) */
export function EmptyState({ query, suggestions }: { query: SearchQuery; suggestions: Card[] }) {
  const filtered = isFiltered(query);
  const hint = !filtered
    ? 'No trips are live right now — check back soon.'
    : query.month
      ? `Nothing departs in ${monthLabel(query.month)} with these filters — the month and the budget are the usual culprits.`
      : 'Loosen one filter — the budget and the nights range are the usual culprits — or start again.';
  return (
    <>
      <div className="grid justify-items-center gap-2.5 rounded-card border-[1.5px] border-dashed border-line px-6 py-12 text-center">
        <h2 className="text-[22px]">
          {filtered ? 'No trips match these filters.' : 'Nothing to show yet.'}
        </h2>
        <p className="max-w-[40ch] text-mute">{hint}</p>
        {filtered && (
          <NavLink
            href="/packages"
            className="mt-2 inline-flex items-center rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink no-underline hover:bg-bg2"
          >
            Clear filters
          </NavLink>
        )}
      </div>
      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions-title" className="mt-12">
          <h2 id="suggestions-title" className="mb-5 text-[clamp(22px,2.6vw,30px)]">
            Try one of these instead
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((c) => (
              <li key={c.slug}>
                <PackageCard card={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
