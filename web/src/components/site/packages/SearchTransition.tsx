'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useTransition, type MouseEvent, type ReactNode } from 'react';

type Search = { pending: boolean; navigate: (href: string) => void };
const SearchContext = createContext<Search>({ pending: false, navigate: () => {} });
export const useSearch = () => useContext(SearchContext);

/**
 * The listing's one transition. Every control calls `navigate(href)`: the URL changes and Next
 * re-renders the server page with the new `searchParams` — no reload, no client fetch, one data
 * path for first render, shared links and live updates. `Results` dims until the new cards land.
 * `replace`, not `push`: filter twiddles are not history entries.
 */
export function SearchTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string) => startTransition(() => router.replace(href, { scroll: false }));
  return <SearchContext.Provider value={{ pending, navigate }}>{children}</SearchContext.Provider>;
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
