/** Display formatting shared by the site. Prices arrive as integer paise; dates as ISO `YYYY-MM-DD`. */

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** `14_499_00` → `₹14,499` (no space after the symbol on any ICU build). */
export const inr = (paise: number) => rupees.format(Math.round(paise / 100)).replace(/\s/g, '');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Parse an ISO date as a calendar day (UTC), so the server's timezone never shifts it. */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** `2026-11-20` → `Fri 20 Nov 2026` */
export function formatDate(iso: string) {
  const d = day(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `2026-12-18` → `18 Dec` */
export function shortDate(iso: string) {
  const d = day(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const duration = (nights: number, days: number) => `${nights}N / ${days}D`;

export function mealsLabel(meals: { breakfast: boolean; lunch: boolean; dinner: boolean }) {
  const names = [
    meals.breakfast && 'Breakfast',
    meals.lunch && 'Lunch',
    meals.dinner && 'Dinner',
  ].filter(Boolean);
  return names.length ? names.join(' · ') : 'No meals';
}

/**
 * `[11, 12, 1, 2]` → `Nov – Feb`. Runs may wrap the year end; several runs join with ` · `
 * (`Mar – Jun · Dec`); every month → `All year`; nothing → ``.
 */
export function monthRange(months: number[]): string {
  const set = new Set(months);
  if (set.size === 0) return '';
  if (set.size === 12) return 'All year';
  const prev = (m: number) => ((m + 10) % 12) + 1;
  const next = (m: number) => (m % 12) + 1;
  const starts = [...set].filter((m) => !set.has(prev(m))).sort((a, b) => a - b);
  return starts
    .map((start) => {
      let end = start;
      while (set.has(next(end))) end = next(end);
      return start === end ? MONTHS[start - 1] : `${MONTHS[start - 1]} – ${MONTHS[end - 1]}`;
    })
    .join(' · ');
}
