'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = { href: string; exact?: boolean; children: ReactNode; count?: number };

/** Sidebar item; active when the path is the href (or under it), like the mockup's `.on`. */
export function NavLink({ href, exact, children, count }: Props) {
  const path = usePathname();
  const on = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold text-[#B7C0C8] transition-colors hover:bg-white/[.06] hover:text-white',
        on && 'bg-primary text-white hover:bg-primary',
      )}
    >
      {children}
      {count ? (
        <span className="num ml-auto rounded-chip bg-action px-2 py-0.5 text-[11px] font-extrabold text-ink">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
