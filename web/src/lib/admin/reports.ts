import type { components } from '@/lib/api-types';
import { istToday } from '@/lib/booking';
import { inr } from '@/lib/format';
import { isoDate, one, oneOf, type RawParams } from './enquiry-filters';

/**
 * The owner's reports (R55, P12) — pure helpers shared by the server page and the client
 * cockpit: the IST presets, the URL, the CSV links and the number formats. Days are plain
 * `YYYY-MM-DD` strings (IST calendar days, no time zones), like the calendar's.
 */

export type Reports = components['schemas']['Reports'];
export type ReportSection = components['schemas']['ReportSection'];
export type ReportDeparture = components['schemas']['ReportDeparture'];
export type ReportChannel = components['schemas']['ReportChannel'];
export type DiscountSource = components['schemas']['DiscountSource'];

export const REPORTS_PATH = '/admin/reports';

export const PRESETS = [
  { id: 'month', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: 'next90', label: 'Next 90 days' },
  { id: 'fy', label: 'This FY' },
  { id: '12m', label: 'Last 12 months' },
  { id: 'custom', label: 'Custom' },
] as const;
export type Preset = (typeof PRESETS)[number]['id'];
const PRESET_IDS = PRESETS.map((p) => p.id);

/** The nine tiles, in report order (the CSV-only `cash` table rides on Money). */
export const SECTIONS = [
  'money',
  'packages',
  'occupancy',
  'funnel',
  'cancellations',
  'discounts',
  'addons',
  'channels',
  'customers',
] as const satisfies readonly ReportSection[];
export type TileSection = (typeof SECTIONS)[number];

export const SECTION_TITLES: Record<TileSection, string> = {
  money: 'Money',
  packages: 'Packages',
  occupancy: 'Occupancy',
  funnel: 'Funnel',
  cancellations: 'Cancellations',
  discounts: 'Discounts',
  addons: 'Add-ons',
  channels: 'Channels',
  customers: 'Customers',
};

// --- days ---------------------------------------------------------------------------------------

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const asIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return asIso(d);
}

const monthStart = (iso: string, shift = 0) => {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  return asIso(new Date(Date.UTC(y, m - 1 + shift, 1)));
};

export const daysIn = (from: string, to: string) =>
  Math.round((asDate(to).getTime() - asDate(from).getTime()) / 864e5) + 1;

/** 1 April of the Indian financial year `iso` falls in. */
export function fyStart(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  return `${m >= 4 ? y : y - 1}-04-01`;
}

export function presetRange(preset: Exclude<Preset, 'custom'>, today: string): [string, string] {
  switch (preset) {
    case 'month':
      return [monthStart(today), addDays(monthStart(today, 1), -1)];
    case 'last':
      return [monthStart(today, -1), addDays(monthStart(today), -1)];
    case 'next90':
      return [today, addDays(today, 89)];
    case '12m':
      return [addDays(today, -364), today];
    case 'fy': {
      const start = fyStart(today);
      return [start, addDays(`${Number(start.slice(0, 4)) + 1}-04-01`, -1)];
    }
  }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Apr 2026" */
export function dayLabel(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** "6 Nov" */
export const shortDay = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;

/** "2026-05" → "May" (or "May 26" when the range crosses a year). */
export function monthLabel(month: string, withYear = false): string {
  const name = MON[Number(month.slice(5, 7)) - 1]!;
  return withYear ? `${name} ’${month.slice(2, 4)}` : name;
}

/** "May 2026" — for sentences, where "May ’26" reads as shorthand. */
export const monthLong = (month: string) => `${monthLabel(month)} ${month.slice(0, 4)}`;

export const rangeLabel = (from: string, to: string) => `${dayLabel(from)} – ${dayLabel(to)}`;

// --- the URL ------------------------------------------------------------------------------------

export type ReportParams = {
  preset: Preset;
  from: string;
  to: string;
  demo: boolean;
  section: TileSection;
};

/**
 * `?p=&from=&to=&demo=0&s=` — the URL is the report (shareable, survives refresh). A custom
 * range that is missing, backwards or wider than the api allows falls back to this FY rather
 * than answering a 400.
 */
export function parseReportParams(raw: RawParams, today: string = istToday()): ReportParams {
  const asked = oneOf(PRESET_IDS, one(raw.p));
  const section = oneOf(SECTIONS, one(raw.s)) ?? 'money';
  const demo = one(raw.demo) !== '0';
  if (asked === 'custom') {
    const from = isoDate(one(raw.from));
    const to = isoDate(one(raw.to));
    if (from && to && from <= to && daysIn(from, to) <= SPAN_MAX_DAYS) {
      return { preset: 'custom', from, to, demo, section };
    }
  }
  const preset = asked && asked !== 'custom' ? asked : 'fy';
  const [from, to] = presetRange(preset, today);
  return { preset, from, to, demo, section };
}

export const SPAN_MAX_DAYS = 1096; // the api's three years

export function reportsHref(p: ReportParams, change: Partial<ReportParams> = {}): string {
  const next = { ...p, ...change };
  const q = new URLSearchParams();
  if (next.preset !== 'fy') q.set('p', next.preset);
  if (next.preset === 'custom') {
    q.set('from', next.from);
    q.set('to', next.to);
  }
  if (!next.demo) q.set('demo', '0');
  if (next.section !== 'money') q.set('s', next.section);
  const s = q.toString();
  return s ? `${REPORTS_PATH}?${s}` : REPORTS_PATH;
}

/** The api's query for this report. */
export const apiQuery = (p: ReportParams) => ({
  from: p.from,
  to: p.to,
  ...(p.demo ? {} : { demo: 'false' }),
});

/** Through the `/api` rewrite, so the owner's cookie rides along. */
export function csvHref(p: ReportParams, section: ReportSection): string {
  const q = new URLSearchParams({ from: p.from, to: p.to });
  if (!p.demo) q.set('demo', 'false');
  return `/api/admin/reports/${section}.csv?${q.toString()}`;
}

// --- numbers ------------------------------------------------------------------------------------

export { inr };

/** `₹41.5 L` / `₹2.3 Cr` / `₹48,000` — tiles and axis ticks; tables carry the full figure. */
export function lakh(paise: number): string {
  const r = paise / 100;
  const sign = r < 0 ? '−' : '';
  const a = Math.abs(r);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)} L`;
  return `${sign}${inr(Math.abs(paise))}`;
}

/** "62%" / "4.3%" — whole percent unless it is small. `—` with nothing to divide by. */
export function pct(part: number, whole: number): string {
  if (!whole) return '—';
  const v = (part * 100) / whole;
  return `${v > 0 && v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

/** "+12% vs 1 Sep – 30 Sep" style change against the previous range; null when there is none. */
export function change(now: number, before: number): { up: boolean; text: string } | null {
  if (!before) return null;
  const d = ((now - before) * 100) / before;
  return { up: d >= 0, text: `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}%` };
}

export const CHANNEL_LABELS: Record<ReportChannel['channel'], string> = {
  web: 'Web',
  phone: 'Phone',
  walk_in: 'Walk-in',
  whatsapp: 'WhatsApp',
  enquiry: 'Enquiry',
};
