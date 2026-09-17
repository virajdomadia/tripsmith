'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';
import type { components } from '@/lib/api-types';
import { parseSearchQuery, searchHref } from '@/lib/search';
import { Calendar, Pin, Rupee } from './icons';

type Facets = components['schemas']['SearchFacets'];

/** Per-person ceilings offered on the home page; the /packages rail has the full slider. */
const BUDGETS = [15_000, 20_000, 25_000, 30_000, 40_000, 50_000];

const rupees = new Intl.NumberFormat('en-IN');

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 transition-colors hover:bg-bg2 has-[:focus-visible]:bg-bg2">
      <span className="text-primary">{icon}</span>
      <span className="grid min-w-0 flex-1">
        <span className="label-caps">{label}</span>
        {children}
      </span>
    </label>
  );
}

const select = 'w-full cursor-pointer truncate bg-transparent font-bold text-ink outline-none';

/**
 * S1 search bar. A plain GET form to /packages whose field names are the search query keys, so
 * it works without JS; with JS the blank fields are dropped so the URL stays canonical.
 */
export function SearchBar({ facets }: { facets: Facets }) {
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(
      [...new FormData(e.currentTarget).entries()].map(([k, v]) => [k, String(v)]),
    );
    router.push(searchHref(parseSearchQuery(raw)));
  }

  return (
    <form
      action="/packages"
      method="get"
      onSubmit={onSubmit}
      role="search"
      aria-label="Find a trip"
      className="relative z-10 mx-auto -mt-16 grid w-[min(1080px,100%-32px)] gap-1.5 rounded-card bg-bg p-2.5 shadow-[0_30px_60px_-24px_rgb(20_32_42/0.35),0_1px_0_rgb(0_0_0/0.04)] md:-mt-[72px] md:grid-cols-[1.3fr_1fr_1fr_auto]"
    >
      <Field icon={<Pin className="size-5" />} label="Where to">
        <select name="destination" defaultValue="" className={select}>
          <option value="">Anywhere in India</option>
          {facets.destinations.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      <Field icon={<Calendar className="size-5" />} label="Travel month">
        <select name="month" defaultValue="" className={select}>
          <option value="">Any month</option>
          {facets.months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field icon={<Rupee className="size-5" />} label="Budget / person">
        <select name="maxBudget" defaultValue="" className={select}>
          <option value="">Any budget</option>
          {BUDGETS.map((b) => (
            <option key={b} value={b}>
              Up to ₹{rupees.format(b)}
            </option>
          ))}
        </select>
      </Field>
      <button
        type="submit"
        className="rounded-btn bg-action px-6 py-3 text-[15px] font-bold text-ink transition-colors hover:bg-action-ink"
      >
        Search trips
      </button>
    </form>
  );
}
