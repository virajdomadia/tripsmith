import type { SVGProps } from 'react';

/** Inline stroke icons in `currentColor`; size with `h-4 w-4`. */
const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...props,
});

export const Check = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const Cross = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const Meal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 11h18M12 4a8 8 0 0 1 8 7H4a8 8 0 0 1 8-7ZM5 15h14M7 19h10" />
  </svg>
);
export const Bed = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 18V8M21 18v-6a3 3 0 0 0-3-3h-7v6M3 15h18M3 9h4a2 2 0 0 1 2 2v4" />
  </svg>
);
