import { MONTHS } from '@/lib/format';

/**
 * The enquiries feature reads a received timestamp as an IST calendar day (F21 plan, design
 * decision 3) — the same rule the inbox's date filter and its CSV export already use. Every
 * display helper in this feature routes through here so the day and month agree everywhere on
 * these screens.
 *
 * Month names come from `MONTHS` (`@/lib/format`), never from `Intl`: on some ICU builds
 * (Node 22 among them) `Intl`'s `short` month renders "Sept" where the rest of the app says
 * "Sep". The day and month below are pulled from `Intl.DateTimeFormat` as bare numbers, which
 * is ICU-stable, and only then mapped onto `MONTHS` — so the month name can never come from
 * Intl's own naming.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const IST_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

/** The IST calendar day of a timestamp, as numbers only. */
function istDateParts(iso: string): { year: number; month: number; day: number } {
  const parts = IST_DATE_PARTS.formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** `2026-09-22T06:14:00Z` → `22 Sep` (the IST calendar day). */
export function istShortDate(iso: string): string {
  const { day, month } = istDateParts(iso);
  return `${day} ${MONTHS[month - 1]}`;
}

/**
 * `2026-11-20T02:00:00Z` → `Fri 20 Nov 2026` (the IST calendar day) — the same shape as
 * `formatDate` in `@/lib/format`, but for a full timestamp rather than a date-only string, so a
 * 2 am IST enquiry doesn't read as the previous day's.
 */
export function istFullDate(iso: string): string {
  const { year, month, day } = istDateParts(iso);
  // A pure calendar-math weekday from the IST y/m/d — no further Intl call, so nothing here can
  // disagree between a server render and a browser one.
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]} ${year}`;
}

/** `2026-09-22T06:14:00Z` → `11:44 am` in IST. Hour and minute are ICU-stable, so they still
 * come from `Intl`. */
export function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  });
}
