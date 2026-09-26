import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { SignInForm } from '@/components/site/account/SignInForm';
import { DEMO_TRAVELLER } from '@/lib/reviews';

type Search = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: 'Sign in to My trips',
  robots: { index: false, follow: false },
};

/** The customer's sign-in (R18): email → 6-digit code. The owner signs in at /admin/login. */
export default async function AccountSignInPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const signedOut = (await searchParams).signedout === '1';
  return (
    <Container className="grid max-w-[480px] gap-6 pt-10 pb-16 sm:pt-16">
      <header>
        <p className="label-caps text-mute">My trips</p>
        <h1 className="mt-1 text-[clamp(30px,4vw,40px)]">Sign in to see your trips</h1>
        <p className="mt-2 text-ink2">
          Booked without an account? Your trips appear as soon as you sign in with the same email.
        </p>
      </header>

      <section className="rounded-card border border-line bg-bg p-5 shadow-lift sm:p-6">
        <SignInForm signedOut={signedOut} />
      </section>

      <p className="rounded-btn border border-line bg-bg2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink2">
        <b className="font-bold text-ink">This is a portfolio demo.</b> While email delivery is off,
        the code is shown on screen — so anyone can open the trips booked with any email. Book with
        made-up details.{' '}
        <Link href="/privacy#demo" className="whitespace-nowrap">
          More in the privacy policy
        </Link>
        <span className="mt-1.5 block">
          {/* B13: scripts/seed.py --demo-traveller — two past trips, one waiting for a review. */}
          To try reviews, sign in as{' '}
          <b className="font-bold break-all text-ink">{DEMO_TRAVELLER}</b> — two past trips, one
          still waiting for its review.
        </span>
      </p>
      <p className="text-center text-[13px] text-mute">
        Running Tripsmith?{' '}
        <Link href="/admin/login" className="font-semibold">
          Owner sign-in
        </Link>
      </p>
    </Container>
  );
}
