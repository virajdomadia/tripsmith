/**
 * The one way stars are drawn (B13, R21): filled stars in the darker amber, the rest in the
 * line grey, and the number printed beside them — the glyphs alone never carry the value.
 * `value` may be an average (4.7): the stars round to the nearest whole one, the number keeps
 * the decimal. `onDark` swaps to the bright marigold for text over a photo.
 */
export function Stars({
  value,
  label,
  number = value.toFixed(Number.isInteger(value) ? 0 : 1),
  onDark = false,
  className = '',
}: {
  value: number;
  /** What a screen reader hears; defaults to "4 out of 5 stars". */
  label?: string;
  /** What is printed beside the stars; `null` for none (only when the value is printed next to it anyway). */
  number?: string | null;
  onDark?: boolean;
  className?: string;
}) {
  const filled = Math.min(5, Math.max(0, Math.round(value)));
  const spoken = label ?? `${number ?? value} out of 5 stars`;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        role="img"
        aria-label={spoken}
        className={`leading-none tracking-[0.12em] ${onDark ? 'text-action' : 'text-star'}`}
      >
        {'★'.repeat(filled)}
        <span className={onDark ? 'text-white/35' : 'text-line'}>{'★'.repeat(5 - filled)}</span>
      </span>
      {number !== null && (
        <span aria-hidden className="num font-bold">
          {number}
        </span>
      )}
    </span>
  );
}
