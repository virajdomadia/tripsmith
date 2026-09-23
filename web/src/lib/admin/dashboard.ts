/**
 * Pure helpers behind `/admin` (F22, mockup A2). The api does the arithmetic; everything here
 * turns its numbers into the words on the tiles, so the page itself stays markup.
 *
 * Times are read in IST, like the rest of the admin screens — the owner's clock decides whether
 * it is still morning, not the region the render happened in.
 */

import type { components } from '@/lib/api-types';

export type Dashboard = components['schemas']['Dashboard'];
export type PackageCount = components['schemas']['PackageCount'];
export type UpcomingDeparture = components['schemas']['UpcomingDeparture'];

const IST_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  hour12: false,
});

/** `Good morning` until noon, `Good afternoon` until 5 pm, `Good evening` after (A2). */
export function greeting(now: Date = new Date()): string {
  // `en-GB` + hour12:false renders midnight as `24` on some ICU builds; `% 24` normalises it.
  const hour = Number(IST_HOUR.format(now)) % 24;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export type Direction = 'up' | 'down' | 'flat';
export interface Trend {
  direction: Direction;
  label: string;
}

/**
 * The delta line under a tile. A percentage needs something to divide by, so a zero baseline
 * is reported in words rather than as an infinite rise.
 */
export function trend(current: number, previous: number, period: string): Trend {
  if (previous === 0) {
    if (current === 0) return { direction: 'flat', label: `Nothing ${period} either` };
    return { direction: 'up', label: `${period} had none` };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { direction: 'flat', label: `Same as ${period}` };
  return {
    direction: pct > 0 ? 'up' : 'down',
    label: `${pct > 0 ? '+' : ''}${pct}% vs ${period}`,
  };
}

/** How long the oldest untouched enquiry has been waiting: `42 min`, `1 h 12 min`, `3 days`. */
export function waited(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * A bar's width as a percentage of the biggest row. The floor keeps a single view or enquiry
 * visible as a sliver instead of nothing at all.
 */
export function barWidth(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.max(6, Math.round((count / max) * 100));
}

/** The seat bar on a departure row: how full it is, and whether that is worth worrying about. */
export function seats(departure: Pick<UpcomingDeparture, 'seatsLeft' | 'seatsTotal'>) {
  const total = Math.max(departure.seatsTotal, 1);
  const left = Math.max(0, Math.min(departure.seatsLeft, total));
  return { fill: Math.round((left / total) * 100), low: left > 0 && left <= 4, left };
}
