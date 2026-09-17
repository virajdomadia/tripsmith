'use client';

import { useEffect, useState } from 'react';
import {
  type FilterChip,
  resultCount,
  searchHref,
  type SearchQuery,
  SORT_LABEL,
  type SortOrder,
} from '@/lib/search';
import { NavLink, useSearch } from './SearchTransition';

type Props = { query: SearchQuery; total: number; chips: FilterChip[] };

/** S4 `.toolbar`: count · removable chips · sort. */
export function ResultsToolbar({ query, total, chips }: Props) {
  const { navigate, pending } = useSearch();
  const [sort, setSort] = useState(query.sort);
  useEffect(() => {
    if (!pending) setSort(query.sort);
  }, [pending, query.sort]);

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
          value={sort}
          onChange={(e) => {
            const next = e.target.value as SortOrder;
            setSort(next);
            navigate(searchHref({ ...query, sort: next }));
          }}
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
