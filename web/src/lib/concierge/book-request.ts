/**
 * The concierge → Book-now sheet hand-off (v3 C3, R27 `startBooking`).
 *
 * The concierge navigates to `/packages/<slug>?date=…&double=…#book`, the same pre-filled link
 * the "still thinking" email uses (R53). A fresh package page reads that URL itself when it
 * mounts — but a client navigation to the page the visitor is *already on* keeps its
 * `BookNowProvider` mounted, so nothing would open. This module carries the request in plain
 * memory (no cookie, no browser storage): `requestBooking` leaves it for the next provider to
 * mount and tells any provider already mounted; the provider for that package takes it once.
 */

export type BookRequest = { slug: string; search: string };

let pending: BookRequest | null = null;
const listeners = new Set<(r: BookRequest) => void>();

/** `/packages/goa-x?date=…#book` → the request; null for anything else (never a foreign URL). */
export function parseBookUrl(url: string): BookRequest | null {
  const m = url.match(/^\/packages\/([a-z0-9-]+)(\?[^#]*)?#book$/);
  return m ? { slug: m[1]!, search: m[2] ?? '' } : null;
}

export function requestBooking(url: string): BookRequest | null {
  const req = parseBookUrl(url);
  if (!req) return null;
  pending = req;
  for (const fn of listeners) fn(req);
  return req;
}

/** The request for this package, once (null when there is none or it is for another trip). */
export function takeBooking(slug: string): BookRequest | null {
  if (pending?.slug !== slug) return null;
  const req = pending;
  pending = null;
  return req;
}

export function onBookingRequest(fn: (r: BookRequest) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
