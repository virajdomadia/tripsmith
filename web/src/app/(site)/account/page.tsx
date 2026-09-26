import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Container } from '@/components/site/Container';
import { TripRow } from '@/components/site/account/TripRow';
import { api, ApiRequestError } from '@/lib/api';
import { ACCOUNT_SIGN_IN } from '@/lib/auth/gate';

type Search = Record<string, string | string[] | undefined>;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My trips',
  robots: { index: false, follow: false },
};

const VOUCHER_NOTICE: Record<string, string> = {
  missing: 'That voucher isn’t on this account, or the booking isn’t confirmed yet.',
  unavailable: 'We couldn’t fetch the voucher just now — try again in a moment.',
};

/**
 * My trips (R18). B8: who is signed in, sign out, and every booking made with this email —
 * attached when they verified it, or made since while signed out. B9 adds the grouping,
 * a detail page and cancellation requests.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  let trips;
  try {
    trips = await api('/account/bookings', { auth: true });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) redirect(ACCOUNT_SIGN_IN);
    throw e;
  }
  const sp = await searchParams;
  const voucher = typeof sp.voucher === 'string' ? VOUCHER_NOTICE[sp.voucher] : undefined;
  const first = trips.name.split(' ')[0];

  return (
    <Container className="max-w-[860px] pt-8 pb-16 sm:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="label-caps text-mute">My trips</p>
          <h1 className="mt-1 text-[clamp(30px,4vw,42px)]">Hello, {first}.</h1>
          <p className="mt-1 text-[15px] text-mute">
            Signed in as <b className="font-semibold text-ink2">{trips.email}</b>
          </p>
        </div>
        <form method="post" action="/api/auth/logout">
          <input type="hidden" name="to" value="account" />
          <button
            type="submit"
            className="rounded-btn border-[1.5px] border-line px-4 py-2.5 text-sm font-bold transition-colors hover:border-ink"
          >
            Sign out
          </button>
        </form>
      </header>

      {voucher && (
        <p
          role="alert"
          className="mt-6 rounded-btn bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn"
        >
          {voucher}
        </p>
      )}

      {trips.bookings.length === 0 ? (
        <section className="mt-10 grid justify-items-start gap-3 rounded-card border border-dashed border-line bg-bg2 p-8">
          <h2 className="text-[22px]">No trips on this email yet.</h2>
          <p className="max-w-[52ch] text-ink2">
            Book a trip with <b className="text-ink">{trips.email}</b> and it shows up here straight
            away — no need to sign in again.
          </p>
          <Link
            href="/packages"
            className="mt-1 rounded-btn bg-action px-5 py-3 font-bold text-ink no-underline transition-colors hover:bg-action-ink"
          >
            Browse trips
          </Link>
        </section>
      ) : (
        <ol className="mt-8 grid gap-4" aria-label="Your bookings, newest first">
          {trips.bookings.map((b, i) => (
            <TripRow key={b.ref} booking={b} index={i} />
          ))}
        </ol>
      )}

      <p className="mt-10 rounded-btn border border-line bg-bg2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink2">
        <b className="font-bold text-ink">Demo site.</b> Payments here are Razorpay test payments,
        and bookings are visible to anyone using the public demo login.{' '}
        <Link href="/privacy#demo" className="whitespace-nowrap">
          More in the privacy policy
        </Link>
      </p>
    </Container>
  );
}
