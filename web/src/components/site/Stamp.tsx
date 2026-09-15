import type { BadgeValue } from './Badge';

const COPY: Record<BadgeValue, [string, string, string]> = {
  'filling-fast': ['Filling', 'fast', 'few seats'],
  'sold-out': ['Sold', 'out', 'this date'],
  guaranteed: ['Departure', '✓', 'guaranteed'],
};
const TONE: Record<BadgeValue, string> = {
  'filling-fast': 'text-warn',
  'sold-out': 'text-mute',
  guaranteed: 'text-ok',
};

/** Dashed-circle postmark (direction K), rotated −12°, top-right inside a `relative` photo box. */
export function Stamp({ value }: { value: BadgeValue | null | undefined }) {
  if (!value) return null;
  const [top, big, bottom] = COPY[value];
  return (
    <div
      role="img"
      aria-label={`${top} ${big} ${bottom}`}
      className={`absolute top-2.5 right-2.5 grid h-21 w-21 -rotate-12 place-items-center rounded-full border-2 border-dashed border-current bg-bg/95 text-center text-[9px] leading-[1.15] font-bold tracking-[0.12em] uppercase shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)] ${TONE[value]}`}
    >
      <span>
        {top}
        <b className="block text-[15px] tracking-tight normal-case">{big}</b>
        {bottom}
      </span>
    </div>
  );
}
