'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { inr } from '@/lib/format';
import {
  DEFAULT_SORT,
  type Facets,
  isFiltered,
  searchHref,
  type SearchQuery,
  type Theme,
} from '@/lib/search';
import { NavLink, useSearch } from './SearchTransition';

type Props = { query: SearchQuery; facets: Facets };

const BUDGET_STEP = 1000; // rupees — the api rounds its facet bounds to the same step
const SLIDER_DEBOUNCE_MS = 350;

/**
 * S4 filter rail. A real GET form to `/packages`, so the URL is the state: with JS every change
 * navigates through the search transition; without it "Show trips" submits the same params.
 * Options (destinations, months, ranges) come from the api's facets — nothing is hard-coded.
 */
export function FilterPanel({ query, facets }: Props) {
  const { navigate, pending } = useSearch();
  const [draft, setDraft] = useState(query);
  const [open, setOpen] = useState(false); // phones: collapsed above the grid (S4)
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setHydrated(true), []);
  // Chips, "Clear all" and back/forward change the URL behind the rail's back: follow the
  // server's query once nothing is in flight.
  useEffect(() => {
    if (!pending) setDraft(query);
  }, [pending, query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Show the change now; navigate now, or after a pause for the slider. */
  const commit = (next: SearchQuery, delay = 0) => {
    setDraft(next);
    clearTimeout(timer.current);
    if (delay) timer.current = setTimeout(() => navigate(searchHref(next)), delay);
    else navigate(searchHref(next));
  };
  const toggleDestination = (slug: string, on: boolean) =>
    commit({
      ...draft,
      destination: on ? [...draft.destination, slug] : draft.destination.filter((d) => d !== slug),
    });
  const toggleTheme = (theme: Theme, on: boolean) =>
    commit({
      ...draft,
      themes: on ? [...draft.themes, theme] : draft.themes.filter((t) => t !== theme),
    });
  const setNights = (nightsMin?: number, nightsMax?: number) =>
    commit({ ...draft, nightsMin, nightsMax });

  const showBudget = facets.budget.max > facets.budget.min;
  const budgetValue = draft.maxBudget ?? facets.budget.max;
  const nightsOptions = range(facets.nights.min, facets.nights.max);
  const activeCount =
    draft.destination.length +
    draft.themes.length +
    (draft.maxBudget !== undefined ? 1 : 0) +
    (draft.nightsMin !== undefined || draft.nightsMax !== undefined ? 1 : 0) +
    (draft.month !== undefined ? 1 : 0);

  return (
    <aside aria-label="Filters" className="lg:sticky lg:top-20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="filter-form"
        className="flex w-full items-center justify-between rounded-btn border border-line px-4 py-3 text-sm font-bold lg:hidden"
      >
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 && (
            <span className="num rounded-chip bg-primary-soft px-2 py-0.5 text-xs text-primary">
              {activeCount}
            </span>
          )}
        </span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>

      <form
        id="filter-form"
        method="get"
        action="/packages"
        className={`${open ? 'grid' : 'hidden'} mt-3 gap-5 rounded-card border border-line p-4.5 lg:mt-0 lg:grid`}
      >
        <Group title="Destination">
          {facets.destinations.map((d) => (
            <Check
              key={d.value}
              name="destination"
              value={d.value}
              label={d.label}
              count={d.count}
              checked={draft.destination.includes(d.value)}
              onChange={(on) => toggleDestination(d.value, on)}
            />
          ))}
        </Group>

        {showBudget && (
          <Group title="Budget per person">
            <label className="grid gap-2 text-sm">
              <span className="flex justify-between font-bold">
                <span>Up to</span>
                <span className="num">
                  {draft.maxBudget === undefined ? 'Any' : inr(budgetValue * 100)}
                </span>
              </span>
              <input
                type="range"
                // Unnamed while unlimited so a no-JS submit does not send "maxBudget=<max>".
                name={draft.maxBudget === undefined ? undefined : 'maxBudget'}
                min={facets.budget.min}
                max={facets.budget.max}
                step={BUDGET_STEP}
                value={budgetValue}
                aria-valuetext={
                  draft.maxBudget === undefined ? 'Any budget' : inr(budgetValue * 100)
                }
                onChange={(e) => {
                  const v = Number(e.target.value);
                  commit(
                    { ...draft, maxBudget: v >= facets.budget.max ? undefined : v },
                    SLIDER_DEBOUNCE_MS,
                  );
                }}
                className="accent-primary"
              />
              <span className="num flex justify-between text-xs font-semibold text-mute">
                <span>{inr(facets.budget.min * 100)}</span>
                <span>{inr(facets.budget.max * 100)}</span>
              </span>
            </label>
          </Group>
        )}

        {facets.nights.max > 0 && (
          <Group title="Nights">
            <div className="grid grid-cols-2 gap-2">
              <Select
                name="nightsMin"
                label="From"
                value={draft.nightsMin}
                options={nightsOptions}
                onChange={(v) =>
                  setNights(
                    v,
                    v !== undefined && draft.nightsMax !== undefined && draft.nightsMax < v
                      ? v
                      : draft.nightsMax,
                  )
                }
              />
              <Select
                name="nightsMax"
                label="To"
                value={draft.nightsMax}
                options={nightsOptions}
                onChange={(v) =>
                  setNights(
                    v !== undefined && draft.nightsMin !== undefined && draft.nightsMin > v
                      ? v
                      : draft.nightsMin,
                    v,
                  )
                }
              />
            </div>
          </Group>
        )}

        <Group title="Theme">
          {facets.themes.map((t) => {
            const theme = t.value as Theme;
            const checked = draft.themes.includes(theme);
            return (
              <Check
                key={t.value}
                name="themes"
                value={t.value}
                label={t.label}
                count={t.count}
                checked={checked}
                disabled={t.count === 0 && !checked}
                onChange={(on) => toggleTheme(theme, on)}
              />
            );
          })}
        </Group>

        {facets.months.length > 0 && (
          <Group title="Travel month">
            <Check
              type="radio"
              name="month"
              value=""
              label="Any month"
              checked={draft.month === undefined}
              onChange={() => commit({ ...draft, month: undefined })}
            />
            {facets.months.map((m) => (
              <Check
                key={m.value}
                type="radio"
                name="month"
                value={m.value}
                label={m.label}
                count={m.count}
                checked={draft.month === m.value}
                onChange={() => commit({ ...draft, month: m.value })}
              />
            ))}
          </Group>
        )}

        {draft.sort !== DEFAULT_SORT && <input type="hidden" name="sort" value={draft.sort} />}

        <div className="flex flex-wrap gap-2">
          {!hydrated && (
            <button
              type="submit"
              className="rounded-btn bg-primary px-4 py-2.5 text-sm font-bold text-white"
            >
              Show trips
            </button>
          )}
          {isFiltered(draft) && (
            <NavLink
              href="/packages"
              className="rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink no-underline hover:bg-bg2"
            >
              Clear all
            </NavLink>
          )}
        </div>
      </form>
    </aside>
  );
}

const range = (min: number, max: number) =>
  max >= min ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <h3 className="label-caps">{title}</h3>
      {children}
    </div>
  );
}

function Check({
  type = 'checkbox',
  name,
  value,
  label,
  count,
  checked,
  disabled,
  onChange,
}: {
  type?: 'checkbox' | 'radio';
  name: string;
  value: string;
  label: string;
  count?: number;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 text-sm ${disabled ? 'text-mute/60' : 'cursor-pointer'}`}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4.5 accent-primary"
      />
      <span>{label}</span>
      {count !== undefined && <span className="num ml-auto text-xs text-mute">{count}</span>}
    </label>
  );
}

function Select({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: number | undefined;
  options: number[];
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-mute">
      {label}
      <select
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className="rounded-btn border border-line bg-bg px-2.5 py-2 text-sm font-semibold text-ink"
      >
        <option value="">Any</option>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
