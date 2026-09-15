/** The Tripsmith mark on the K tokens: ocean tile, dashed route from a dot to the marigold sun. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      className="shrink-0 rounded-[25%] bg-primary"
    >
      <path
        d="M14 44C22 44 22 26 32 26s10 14 18-4"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="6 6"
      />
      <circle cx="50" cy="22" r="6" className="fill-action" />
      <circle cx="14" cy="44" r="4" fill="#fff" />
    </svg>
  );
}
