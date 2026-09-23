import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
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

/** A1. Single owner login, sign-up disabled; the demo login is prefilled for the portfolio. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const error = isLoginError(one('error')) ? (one('error') as LoginError) : undefined;
  const signedOut = one('signedout') === '1';
  const next = safeNext(one('next'));
  const demo = demoCredentials();
  const email = one('email') ?? demo?.email ?? '';

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative h-[220px] lg:h-auto">
        <Image
          src="/auth/login.jpg"
          alt="Pangong lake, Ladakh"
          fill
          priority
          fetchPriority="high"
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
        <p className="absolute bottom-6 left-6 text-white lg:bottom-8 lg:left-8">
          <b className="block text-[28px] font-extrabold tracking-[-0.03em]">Tripsmith admin</b>
          Packages, departures, enquiries.
        </p>
      </section>

      <section className="grid place-items-center p-6 sm:p-10">
        <form
          method="post"
          action="/api/auth/login"
          className="grid w-full max-w-[400px] gap-3.5"
          noValidate
        >
          <Link href="/" className="flex items-center gap-2 font-extrabold">
            <BrandMark size={28} />
            Tripsmith
          </Link>
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Sign in</h1>

          {demo && (
            <p className="rounded-[10px] bg-primary-soft px-3 py-2.5 text-[13px] font-semibold text-primary">
              Demo: {demo.email} / {demo.password}
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
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              defaultValue={demo?.password ?? ''}
              className={control}
            />
          </Field>
          <input type="hidden" name="next" value={next} />

          <button
            type="submit"
            className="rounded-btn bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-ink"
          >
            Sign in
          </button>
          <p className="text-xs text-mute">
            Forgot your password? Email{' '}
            <a href={`mailto:${BUSINESS.email}`} className="underline">
              {BUSINESS.email}
            </a>
            . ·{' '}
            <Link href="/" className="underline">
              Back to the site
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
