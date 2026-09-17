import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { EMPTY_QUERY, searchHref, THEMES, type Theme } from '@/lib/search';
import { Bolt, Family, Fort, Heart, Mountain, Wave } from './icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const CHIP: Record<Theme, [Icon, string]> = {
  beach: [Wave, 'Beach'],
  hills: [Mountain, 'Hills'],
  honeymoon: [Heart, 'Honeymoon'],
  family: [Family, 'Family'],
  adventure: [Bolt, 'Adventure'],
  heritage: [Fort, 'Heritage'],
};

/** Six theme shortcuts into the listing, under the search bar (S1). */
export function ThemeChips() {
  return (
    <ul aria-label="Browse by theme" className="mt-6 flex flex-wrap justify-center gap-2.5">
      {THEMES.map((t) => {
        const [Icon, label] = CHIP[t];
        return (
          <li key={t}>
            <Link
              href={searchHref({ ...EMPTY_QUERY, themes: [t] })}
              className="inline-flex items-center gap-2 rounded-chip border-[1.5px] border-line bg-bg px-3.5 py-2 text-sm font-semibold text-ink no-underline transition-[border-color,color,transform] duration-300 ease-(--ease-out) hover:-translate-y-0.5 hover:border-primary hover:text-primary"
            >
              <Icon className="size-4 text-primary" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
