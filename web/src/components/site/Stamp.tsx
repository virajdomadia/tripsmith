import type { BadgeValue } from './Badge';

const COPY: Record<BadgeValue, [string, string, string]> = {
  'filling-fast': ['Filling', 'fast', 'few seats'],
  'sold-out': ['Sold', 'out', 'this date'],
  'likely-to-sell-out': ['Likely to', 'sell out', 'next date'],
  guaranteed: ['Departure', '✓', 'guaranteed'],
};
const TONE: Record<BadgeValue, string> = {
  'filling-fast': 'text-warn',
  'sold-out': 'text-mute',
  'likely-to-sell-out': 'text-primary',
  guaranteed: 'text-ok',
};

/**
 * Dashed-circle postmark (direction K), rotated −12°, top-right inside a `relative` photo box.
 * P2 (R40): with `seatsLeft`, Filling fast and Likely to sell out print the exact count.
 */
export function Stamp({
  value,
  seatsLeft,
}: {
  value: BadgeValue | null | undefined;
  seatsLeft?: number | null;
}) {
  if (!value) return null;
  const [top, big, fallback] = COPY[value];
  const counted =
    (value === 'filling-fast' || value === 'likely-to-sell-out') &&
    seatsLeft != null &&
    seatsLeft > 0;
  const bottom = counted ? `${seatsLeft} left` : fallback;
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

/**
 * B12: a running deal's label in the same corner, as a marigold postmark (the stamp colour in
 * the token sheet). A pill rather than the circle: an owner's label runs up to 24 characters.
 * It replaces the seat stamp on the card; seats stay on the package page's departure rows.
 */
export function DealStamp({ label }: { label: string }) {
  return (
    <div className="absolute top-3 right-2.5 max-w-[calc(100%-20px)] -rotate-6 rounded-full border-2 border-dashed border-ink/60 bg-action px-3 py-1.5 text-[11px] leading-none font-extrabold tracking-[0.1em] whitespace-nowrap text-ink uppercase shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)]">
      {label}
    </div>
  );
}
