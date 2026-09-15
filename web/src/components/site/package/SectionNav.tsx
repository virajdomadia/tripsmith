'use client';

import { useEffect, useState } from 'react';

export type NavSection = { id: string; label: string };

/** Sticky pill row (S5 `.subnav`). The section nearest the top of the viewport owns the dark pill. */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-16 z-20 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-line bg-bg/90 px-4 py-2 backdrop-blur [scrollbar-width:none]"
    >
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={active === s.id ? 'location' : undefined}
          className={`rounded-chip px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
            active === s.id ? 'bg-ink text-white' : 'text-mute hover:bg-bg2 hover:text-ink'
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
