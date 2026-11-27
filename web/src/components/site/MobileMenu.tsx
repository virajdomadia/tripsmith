'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { BUSINESS, whatsappHref } from '@/lib/business';

/**
 * Review 2026-11-27 (M7): below `lg` the header keeps Packages, a call button and this menu; the
 * other sections, WhatsApp and the phone number live here. A native `<details>`, so it opens
 * without JS; it closes when the route changes (the header stays mounted across pages).
 */
export function MobileMenu({ links }: { links: readonly (readonly [string, string])[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);
  // A menu closes on Escape and on a tap anywhere else.
  useEffect(() => {
    const close = (e: Event) => {
      const el = menu.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) {
        el.open = false;
        if (e instanceof KeyboardEvent) el.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  const item = 'flex min-h-11 items-center rounded-btn px-3 text-ink no-underline hover:bg-bg2';
  return (
    <details ref={menu} className="group relative lg:hidden">
      <summary
        aria-label="Menu"
        className="grid size-11 cursor-pointer list-none place-items-center rounded-full text-ink hover:bg-bg2 group-open:bg-bg2 [&::-webkit-details-marker]:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </summary>
      <div className="absolute top-12 right-0 grid w-56 gap-0.5 rounded-card border border-line bg-bg p-2 text-[15px] font-semibold shadow-lift">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={item}>
            {label}
          </Link>
        ))}
        <a href={whatsappHref()} target="_blank" rel="noopener" className={item}>
          WhatsApp us
        </a>
        <a href={BUSINESS.phoneHref} className={`num ${item}`}>
          Call {BUSINESS.phoneDisplay}
        </a>
      </div>
    </details>
  );
}
