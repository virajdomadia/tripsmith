'use client';

import { type FilterChip, resultCount, SORT_LABEL, type SortOrder } from '@/lib/search';
import { NavLink, useSearch } from './SearchTransition';

type Props = { total: number; chips: FilterChip[] };

/** S4 `.toolbar`: count · removable chips · sort. The next URL comes from the shared (optimistic)
 * query, so a sort change keeps a filter that is still loading. */
export function ResultsToolbar({ total, chips }: Props) {
  const { query, update } = useSearch();

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="num font-bold" role="status">
        {resultCount(total)}
      </span>
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <NavLink
                href={chip.href}
                ariaLabel={`Remove ${chip.label}`}
                className="inline-flex items-center gap-1.5 rounded-chip bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary no-underline transition-colors hover:bg-primary hover:text-white"
              >
                {chip.label}
                <span aria-hidden>×</span>
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink
              href="/packages"
              className="inline-flex items-center rounded-chip px-2.5 py-1 text-xs font-bold text-mute no-underline hover:text-ink"
            >
              Clear all
            </NavLink>
          </li>
        </ul>
      )}
      <label className="ml-auto flex items-center gap-2 text-sm text-mute">
        Sort
        <select
          value={query.sort}
          onChange={(e) => update({ ...query, sort: e.target.value as SortOrder })}
          className="rounded-btn border border-line bg-bg px-2.5 py-1.5 text-sm font-semibold text-ink"
        >
          {(Object.keys(SORT_LABEL) as SortOrder[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
