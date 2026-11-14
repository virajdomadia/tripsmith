'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import {
  BUDGETS,
  budgetLabel,
  type FacetOption,
  FINDER_SHOWN,
  type FinderQuery,
  finderUrl,
  type PackageList,
  toChatPackage,
} from '@/lib/concierge/finder';
import { monthLabel } from '@/lib/concierge/reducer';
import type { ChatPackage } from '@/lib/concierge/types';

/**
 * The no-AI quick finder (v3 C6, R28) — where the message box was. Destination · month · budget
 * run the listing's own search (`GET /api/packages`, cached like the trips page), and the results
 * land in the conversation as the chat's own cards; the ticket stamps what was searched. No model
 * call, so it works when the concierge is out of turns, has no key, or keeps failing.
 *
 * The options come from the same search's facets — only destinations and months that have trips.
 */

type Facets = { destinations: FacetOption[]; months: FacetOption[] };

const FIELD =
  'h-10 w-full min-w-0 truncate rounded-[10px] border border-line bg-bg px-2.5 text-[14px] font-semibold text-ink outline-none focus:border-primary disabled:opacity-60';
const LABEL = 'grid min-w-0 gap-1 text-[10.5px] font-bold tracking-[0.06em] text-mute uppercase';

async function getList(url: string): Promise<PackageList> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as PackageList;
}

export function QuickFinder({
  locked,
  onFound,
  onBack,
  onNavigate,
}: {
  /** Out of turns: no way back to the chat. */
  locked: boolean;
  onFound: (query: FinderQuery, packages: ChatPackage[], total: number) => void;
  onBack: () => void;
  onNavigate: () => void;
}) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [failed, setFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState('');
  const [month, setMonth] = useState('');
  const [budget, setBudget] = useState('');

  useEffect(() => {
    let live = true;
    getList(finderUrl({}))
      .then((list) => {
        if (live) setFacets({ destinations: list.facets.destinations, months: list.facets.months });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!facets || searching) return;
    const dest = facets.destinations.find((d) => d.value === destination);
    const mon = facets.months.find((m) => m.value === month);
    const query: FinderQuery = {
      destination: dest ? { slug: dest.value, name: dest.label } : undefined,
      month: mon ? { value: mon.value, label: mon.label } : undefined,
      maxBudget: budget ? Number(budget) : undefined,
    };
    setSearching(true);
    setFailed(false);
    try {
      const list = await getList(finderUrl(query));
      const packages = list.items
        .map(toChatPackage)
        .filter((p): p is ChatPackage => p !== null)
        .slice(0, FINDER_SHOWN);
      onFound(query, packages, list.total);
    } catch {
      setFailed(true);
    } finally {
      setSearching(false);
    }
  };

  const loading = !facets && !failed;

  return (
    <form
      onSubmit={submit}
      aria-label="Quick finder"
      data-quick-finder
      className="shrink-0 border-t border-line bg-bg px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))]"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
        <p className="text-[13px] font-extrabold text-ink">Quick finder</p>
        {locked ? (
          <span className="text-[11.5px] font-semibold text-mute">No AI · ₹0 · live trips</span>
        ) : (
          <button
            type="button"
            onClick={onBack}
            className="text-[12.5px] font-bold text-primary-ink underline underline-offset-2"
          >
            Back to the chat
          </button>
        )}
      </div>
      <div className="grid grid-cols-[1.25fr_1fr_1fr] gap-1.5">
        <label className={LABEL}>
          Where
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            disabled={!facets}
            className={FIELD}
          >
            <option value="">{loading ? 'Loading…' : 'Anywhere'}</option>
            {facets?.destinations.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          When
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={!facets}
            className={FIELD}
          >
            <option value="">Any</option>
            {facets?.months.map((m) => (
              <option key={m.value} value={m.value}>
                {monthLabel(m.value) ?? m.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Budget pp
          <select
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            disabled={!facets}
            className={FIELD}
          >
            <option value="">Any</option>
            {BUDGETS.map((b) => (
              <option key={b} value={b}>
                {budgetLabel(b)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={!facets || searching}
        className="mt-2 h-10 w-full rounded-[11px] bg-action text-[14.5px] font-extrabold text-ink transition-opacity disabled:opacity-50"
      >
        {searching ? 'Finding trips…' : 'Find trips'}
      </button>
      {failed && (
        <p role="alert" className="mt-1.5 px-0.5 text-[12.5px] font-semibold text-warn">
          Couldn’t load trips just now.{' '}
          <Link href="/packages" onClick={onNavigate} className="underline underline-offset-2">
            Open the trips page
          </Link>{' '}
          instead.
        </p>
      )}
    </form>
  );
}
