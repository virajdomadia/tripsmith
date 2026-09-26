import type { components } from '@/lib/api-types';
import {
  ID_MAX,
  MAX_PAGE,
  SEARCH_MAX,
  bounded,
  isoDate,
  one,
  oneOf,
  type RawParams,
} from './enquiry-filters';

export type BookingStatus = components['schemas']['BookingStatus'];
export type BookingFlag = 'refund' | 'cancellation';
export type CancelReason = components['schemas']['CancelReason'];
export type BookingRow = components['schemas']['BookingRow'];
export type AdminBooking = components['schemas']['AdminBooking'];
export type DepartureSeats = components['schemas']['DepartureSeats'];

export const DESK_PATH = '/admin/bookings';
export const CSV_PATH = '/api/admin/bookings.csv';
export const manifestHref = (departureId: string) =>
  `/admin/departures/${encodeURIComponent(departureId)}/manifest`;

/** The tabs, in desk order. `partially_paid` (add-on D) is filterable but has no tab yet. */
export const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
const ALL_STATUSES = [...STATUSES, 'partially_paid'] as const satisfies readonly BookingStatus[];
export const FLAGS = ['refund', 'cancellation'] as const satisfies readonly BookingFlag[];

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  partially_paid: 'Part paid',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const FLAG_LABELS: Record<BookingFlag, string> = {
  refund: 'Refund needed',
  cancellation: 'Cancellation requested',
};

/** Mirrors the api's CSV `CANCEL_LABELS` (services/booking/desk.py). */
export const CANCEL_LABELS: Record<CancelReason, string> = {
  hold_expired: 'Hold expired',
  payment_failed: 'Payment failed',
  seats_gone: 'Seats gone',
  cancellation_approved: 'Cancellation approved',
  owner_released: 'Released by owner',
};

/** One line for a row's state: a pending booking says whether its hold still runs. */
export function stateLabel(b: {
  status: BookingStatus;
  holdLive: boolean;
  cancelReason: CancelReason | null;
}): string {
  if (b.status === 'pending') return b.holdLive ? 'Pending · hold live' : 'Pending · hold lapsed';
  if (b.status === 'cancelled' && b.cancelReason)
    return `Cancelled · ${CANCEL_LABELS[b.cancelReason]}`;
  return STATUS_LABELS[b.status];
}

export interface DeskFilters {
  status?: BookingStatus;
  flag?: BookingFlag;
  packageId?: string;
  departureId?: string;
  /** Departing on or after (the departure's date, not the booked date — decided 2026-09-26). */
  from?: string;
  to?: string;
  q?: string;
  page: number;
}

/** The URL is the filter state, exactly as on the enquiry inbox: unknown values are dropped. */
export function parseDeskFilters(params: RawParams): DeskFilters {
  const page = Number(one(params.page));
  const from = isoDate(one(params.from));
  let to = isoDate(one(params.to));
  if (from && to && to < from) to = undefined;
  return {
    status: oneOf(ALL_STATUSES, one(params.status)),
    flag: oneOf(FLAGS, one(params.flag)),
    packageId: bounded(one(params.packageId), ID_MAX),
    departureId: bounded(one(params.departureId), ID_MAX),
    from,
    to,
    q: one(params.q)?.slice(0, SEARCH_MAX),
    page: Number.isInteger(page) && page > 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

export function deskQuery(f: DeskFilters): Record<string, string | undefined> {
  return {
    status: f.status,
    flag: f.flag,
    packageId: f.packageId,
    departureId: f.departureId,
    from: f.from,
    to: f.to,
    q: f.q,
    page: f.page > 1 ? String(f.page) : undefined,
  };
}

/** The same desk with some filters changed; anything but paging returns to page 1. */
export function deskHref(f: DeskFilters, patch: Partial<DeskFilters>, path = DESK_PATH): string {
  const next: DeskFilters = { ...f, ...patch, page: patch.page ?? 1 };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(deskQuery(next))) if (value) search.append(key, value);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function clampDeskPage(f: DeskFilters, totalPages: number): string | null {
  const last = Math.max(1, totalPages);
  return f.page > last ? deskHref(f, { page: last }) : null;
}

export const deskCsvHref = (f: DeskFilters) => deskHref(f, { page: 1 }, CSV_PATH);
