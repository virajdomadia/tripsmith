import type { Metadata } from 'next';
import { ArrowRight, ChevronLeft, Info, Lock } from 'lucide-react';
import Link from 'next/link';
import beach from '@/assets/about/beach.jpg';
import loginCover from '@/assets/auth/login.jpg';
import munnar from '@/assets/home/about-1.jpg';
import backwaters from '@/assets/home/hero.jpg';
import { PasswordInput } from '@/components/admin/login/PasswordInput';
import { Postcard, type PostcardPhoto } from '@/components/admin/login/Postcard';
import { BrandMark } from '@/components/site/BrandMark';
import { control, Field } from '@/components/site/enquiry/Field';
import { demoCredentials } from '@/lib/auth/demo';
import { type LoginError, safeNext } from '@/lib/auth/gate';
import { BUSINESS } from '@/lib/business';

type Search = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

const ERROR_COPY: Record<LoginError, string> = {
  credentials: 'Wrong email or password.',
  rate_limited: 'Too many attempts — wait a few minutes and try again.',
  unavailable: 'Could not reach the server. Try again in a moment.',
};

function isLoginError(v: string | undefined): v is LoginError {
  return v === 'credentials' || v === 'rate_limited' || v === 'unavailable';
}

const PHOTOS: readonly PostcardPhoto[] = [
  { src: loginCover, alt: 'Pangong lake, Ladakh', place: 'Pangong lake', region: 'Ladakh' },
  {
    src: backwaters,
    alt: 'A houseboat on the Alleppey backwaters, Kerala',
    place: 'The Alleppey backwaters',
    region: 'Kerala',
  },
  {
    src: munnar,
    alt: 'Tea gardens under cloud at Munnar',
    place: 'Tea hills above Munnar',
    region: 'Kerala',
  },
  { src: beach, alt: 'Radhanagar beach, Havelock', place: 'Radhanagar beach', region: 'Andaman' },
];

/**
 * A1, laid out as Sign in B · Postcard (R59, P20): the page is a destination photo, the form a
 * card floating on it. Single owner login, sign-up disabled; the demo login is prefilled for the
 * portfolio. A plain POST form, so it signs in with JavaScript off. On a phone the photo is a
 * 340 px header and the card overlaps its bottom edge.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const error = isLoginError(one('error')) ? (one('error') as LoginError) : undefined;
  const signedOut = one('signedout') === '1';
  const next = safeNext(one('next'));
  const demo = demoCredentials();
  const email = one('email') ?? demo?.email ?? '';

  return (
    <div className="relative grid min-h-dvh overflow-hidden bg-ink lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)]">
      <section className="relative z-[1] order-2 mx-3 -mt-[34px] mb-5 self-start rounded-[22px] bg-bg px-[18px] py-6 shadow-[0_40px_80px_-40px_rgba(0,0,0,.7)] motion-safe:animate-rise lg:m-7 lg:mt-[70px] lg:ml-0 lg:self-center lg:px-7 lg:py-[30px]">
        <form method="post" action="/api/auth/login" className="grid gap-3.5" noValidate>
          <p className="label-caps text-[11px] text-mute">Owner desk</p>
          <h1 className="-mt-1.5 text-[30px] font-extrabold tracking-[-0.03em]">Sign in</h1>

          {demo && (
            <p className="flex gap-2 rounded-[10px] bg-primary-soft px-3 py-2.5 text-[13px] font-semibold text-primary">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Demo: {demo.email} / {demo.password}
              </span>
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-sm font-semibold text-warn"
            >
              {ERROR_COPY[error]}
            </p>
          )}
          {signedOut && !error && (
            <p
              role="status"
              className="rounded-[10px] bg-ok-soft px-3 py-2.5 text-sm font-semibold text-ok"
            >
              You’re signed out.
            </p>
          )}

          <Field label="Email" name="email">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={email}
              className={control}
            />
          </Field>
          <Field label="Password" name="password">
            <PasswordInput defaultValue={demo?.password ?? ''} />
          </Field>
          <input type="hidden" name="next" value={next} />

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-btn bg-action px-5 py-3 font-bold text-ink transition-colors hover:bg-action-ink disabled:opacity-60"
          >
            Sign in
            <ArrowRight className="size-4" aria-hidden />
          </button>
          <p className="text-xs text-mute">
            Forgot your password? Email{' '}
            <a href={`mailto:${BUSINESS.email}`} className="underline">
              {BUSINESS.email}
            </a>
            .
          </p>
          <p className="flex items-center gap-1.5 text-xs text-mute">
            <Lock className="size-3.5" aria-hidden />
            One owner account. Sign-up is off.
          </p>
        </form>
      </section>
      {/* The form comes first in the DOM, so it is first in tab order; the grid puts the photo
          side first on screen. */}
      <section className="order-1 flex min-h-[340px] min-w-0 flex-col justify-between px-[18px] pt-6 pb-[50px] text-white lg:min-h-0 lg:px-[30px] lg:pt-[26px] lg:pb-[30px]">
        <Link
          href="/"
          className="relative z-[1] flex items-center gap-2 font-extrabold text-white no-underline"
        >
          <BrandMark size={28} />
          Tripsmith
          <small className="text-[11px] font-extrabold tracking-[0.12em] text-action uppercase">
            admin
          </small>
        </Link>
        <div className="grid justify-items-start">
          <Postcard photos={PHOTOS} />
          <Link
            href="/"
            className="relative mt-3.5 inline-flex items-center gap-1 text-[13px] font-bold text-white/85 no-underline hover:text-white"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Back to the site
          </Link>
        </div>
      </section>
    </div>
  );
}
