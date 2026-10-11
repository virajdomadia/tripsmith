'use client';

import { useEffect } from 'react';

/**
 * My trips' tab strip scrolls sideways on a phone (four tabs since P1's Saved). When the open
 * tab starts off-screen — Saved, the last one — slide the strip so it shows. Scrolls only the
 * strip, never the page.
 */
export function ActiveTabIntoView({ navId }: { navId: string }) {
  useEffect(() => {
    const nav = document.getElementById(navId);
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const overflow = active.getBoundingClientRect().right - nav.getBoundingClientRect().right;
    if (overflow > 0) nav.scrollLeft += overflow + 16;
  }, [navId]);
  return null;
}
