'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useOptimistic,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { EMPTY_QUERY, parseSearchQuery, searchHref, type SearchQuery } from '@/lib/search';

type Search = {
  pending: boolean;
  /** The query the page is heading to: the server's, or the latest one navigated to. */
  query: SearchQuery;
  /** Navigate to a query built from `query` (filters, sort). */
  update: (next: SearchQuery) => void;
  /** Navigate to a listing href (chips, "Clear all"). */
  navigate: (href: string) => void;
};
const SearchContext = createContext<Search>({
  pending: false,
  query: EMPTY_QUERY,
  update: () => {},
  navigate: () => {},
});
export const useSearch = () => useContext(SearchContext);

/** `/packages?destination=goa&sort=…` → its query, through the same parser the page uses. */
function queryOf(href: string): SearchQuery {
  const sp = new URL(href, 'http://listing.local').searchParams;
  const raw: Record<string, string[]> = {};
  for (const [k, v] of sp) (raw[k] ??= []).push(v);
  return parseSearchQuery(raw);
}

/**
 * The listing's one transition. Every control navigates here: the URL changes and Next
 * re-renders the server page with the new `searchParams` — no reload, no client fetch, one data
 * path for first render, shared links and live updates. `Results` dims until the new cards land.
 * `replace`, not `push`: filter twiddles are not history entries.
 *
 * One source of truth for the next URL: `query` is optimistic — it jumps to each navigation's
 * target at once and settles back onto the server's `query` when the last one lands — so a sort
 * change made while a filter navigation is still in flight builds on that filter instead of
 * dropping it (the rail and the toolbar used to keep separate copies).
 */
export function SearchTransition({
  query: serverQuery,
  children,
}: {
  query: SearchQuery;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useOptimistic(serverQuery);
  const go = (next: SearchQuery, href: string) =>
    startTransition(() => {
      setQuery(next);
      router.replace(href, { scroll: false });
    });
  const update = (next: SearchQuery) => go(next, searchHref(next));
  const navigate = (href: string) => go(queryOf(href), href);
  return (
    <SearchContext.Provider value={{ pending, query, update, navigate }}>
      {children}
    </SearchContext.Provider>
  );
}

export function Results({ children }: { children: ReactNode }) {
  const { pending } = useSearch();
  return (
    <div
      aria-busy={pending}
      className={`motion-reduce:transition-none transition-opacity duration-300 ${pending ? 'opacity-40' : 'opacity-100'}`}
    >
      {children}
    </div>
  );
}

/** A real link (crawlable, works without JS) that runs through the search transition when JS is on. */
export function NavLink({
  href,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const { navigate } = useSearch();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new-tab clicks stay native
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
