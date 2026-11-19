'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = { href: string; exact?: boolean; children: ReactNode; count?: number };

/** Sidebar item; active when the path is the href (or under it), like the mockup's `.on`. */
export function NavLink({ href, exact, children, count }: Props) {
  const path = usePathname();
  const on = exact ? path === href : path === href || path.startsWith(`${href}/`);
  const ref = useRef<HTMLAnchorElement>(null);
  // QA 2026-11-19: below `lg` the nav is a horizontal scroller — bring the current page's item
  // into view so "Coupons" isn't hidden off the right edge while you're on it.
  useEffect(() => {
    if (on && window.matchMedia?.('(max-width: 1023.98px)').matches) {
      ref.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [on]);
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm whitespace-nowrap font-semibold text-ink-soft transition-colors hover:bg-white/[.06] hover:text-white',
        on && 'bg-primary text-white hover:bg-primary',
      )}
    >
      {children}
      {count ? (
        <span className="num ml-auto rounded-chip bg-action px-2 py-0.5 text-[11px] font-extrabold text-ink">
          {count}
          <span className="sr-only"> new</span>
        </span>
      ) : null}
    </Link>
  );
}
