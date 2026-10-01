import type { components } from './api-types';

/** R44 (P6): what a claim link's offer holds (`GET /waitlist/claim/{token}`). */
export type WaitlistClaim = components['schemas']['WaitlistClaim'];
export type AccountWaitlistEntry = components['schemas']['AccountWaitlistEntry'];
export type WaitlistJoined = components['schemas']['WaitlistJoined'];

/** The claim link's token, from `?claim=` on the package page; null when absent or malformed. */
export function claimFromSearch(search: string): string | null {
  const token = new URLSearchParams(search).get('claim');
  return token && /^[A-Za-z0-9]+\.\d+\.[0-9a-f]+$/.test(token) ? token : null;
}

/** An offer the sheet can book: held for this visitor and not yet run out. */
export function claimLive(claim: WaitlistClaim | null, now = Date.now()): boolean {
  return (
    !!claim &&
    (claim.state === 'offered' || claim.state === 'claimed') &&
    !!claim.expiresAt &&
    new Date(claim.expiresAt).getTime() > now
  );
}

/** "Sat 3 Oct, 2:15 pm" in IST — when an offer or its hold ends. */
export function istMoment(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
    .format(new Date(iso))
    .replace(/\s?(am|pm)$/i, (m) => m.toLowerCase());
}

export const seatsWord = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'}`;

/** Why a claim can't be booked any more, in the sheet's words. */
export const CLAIM_ENDED: Record<string, string> = {
  waiting:
    'Your offer ended before it was claimed, so the seats went to the next person. You’re back on the waitlist — we’ll email you if seats free up again.',
  booked: 'You’ve already booked this date — it’s in My trips.',
  closed: 'This date has stopped taking bookings, so the waitlist has closed.',
  removed: 'This waitlist place was removed. WhatsApp us if that’s a mistake.',
  invalid: 'This claim link isn’t valid any more — use the newest link we emailed you.',
};
