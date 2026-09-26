'use client';

import { useEffect, useRef, useState } from 'react';
import { control, Field } from '@/components/site/enquiry/Field';
import { requestCode, SIGN_IN_EMAIL_KEY, type SignInError, verifyCode } from '@/lib/account';
import { ACCOUNT_PATH } from '@/lib/auth/gate';

type Sent = { email: string; demoCode: string | null };

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

function waitCopy(e: SignInError): string {
  if (!e.retryAfter) return e.message;
  const minutes = Math.ceil(e.retryAfter / 60);
  return `${e.message.replace(/ — wait a few minutes.*$/, '')} — try again in ${minutes} min.`;
}

/**
 * The two-step email-code sign-in (R18, B0 mockup "Sign in"). Step 1 asks for the email the
 * trip was booked with; step 2 takes the 6 digits. In demo mode the api returns the code and it
 * is printed here in a dark strip with "Fill it in" — nothing is emailed. A good code sets the
 * session cookie (via the web handler) and the page moves to My trips with a full navigation,
 * so the server reads the new cookie.
 */
export function SignInForm({ signedOut }: { signedOut: boolean }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<SignInError | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const handed = sessionStorage.getItem(SIGN_IN_EMAIL_KEY);
      if (handed) setEmail(handed);
    } catch {
      // storage blocked: the visitor types it
    }
  }, []);

  useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await requestCode(email.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      emailRef.current?.focus();
      return;
    }
    setCode('');
    setSent({ email: res.data.email, demoCode: res.data.demoCode ?? null });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sent || busy) return;
    setBusy(true);
    setError(null);
    const res = await verifyCode(sent.email, code.replace(/\s/g, ''));
    if (res.ok) {
      try {
        sessionStorage.removeItem(SIGN_IN_EMAIL_KEY);
      } catch {
        // nothing to clean up
      }
      window.location.assign(ACCOUNT_PATH);
      return;
    }
    setBusy(false);
    setError(res.error);
    codeRef.current?.select();
  }

  const dead = error?.reason === 'code_dead';

  if (!sent)
    return (
      <form onSubmit={send} className="grid gap-4" noValidate>
        {signedOut && !error && (
          <p
            role="status"
            className="rounded-btn bg-ok-soft px-3 py-2.5 text-sm font-semibold text-ok"
          >
            You’re signed out.
          </p>
        )}
        <Field
          label="Email"
          name="email"
          error={error ? waitCopy(error) : undefined}
          hint="The email you booked with. No password — we send a 6-digit code."
        >
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'email-error' : 'email-hint'}
            className={control}
          />
        </Field>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-btn bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-ink disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send code'}
        </button>
      </form>
    );

  return (
    <form onSubmit={verify} className="grid gap-4 animate-rise" noValidate>
      <p className="text-[15px] text-ink2">
        {sent.demoCode ? 'Code for ' : 'Sent to '}
        <b className="text-ink">{sent.email}</b> · valid for 10 minutes.{' '}
        <button
          type="button"
          onClick={() => {
            setSent(null);
            setError(null);
          }}
          className="font-semibold text-primary underline"
        >
          Use a different email
        </button>
      </p>

      {sent.demoCode && (
        <div className="flex items-center justify-between gap-3 rounded-[12px] bg-ink px-4 py-3 text-white">
          <div>
            <small className="block text-[12px] font-semibold text-[#b7c0c8]">
              Demo mode — email delivery is off. Your code:
            </small>
            <b className="num text-[24px] font-extrabold tracking-[0.18em]">
              {spaced(sent.demoCode)}
            </b>
          </div>
          <button
            type="button"
            onClick={() => {
              setCode(sent.demoCode ?? '');
              setError(null);
              codeRef.current?.focus();
            }}
            className="rounded-btn bg-white px-3.5 py-2 text-sm font-bold text-ink"
          >
            Fill it in
          </button>
        </div>
      )}

      <Field
        label="6-digit code"
        name="code"
        error={error ? waitCopy(error) : undefined}
        hint="Wrong 5 times and the code stops working — just ask for a new one."
      >
        <input
          ref={codeRef}
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'code-error' : 'code-hint'}
          className={`${control} num text-center text-[26px] font-extrabold tracking-[0.35em]`}
        />
      </Field>

      {dead ? (
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="rounded-btn bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-ink disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send a new code'}
        </button>
      ) : (
        <button
          type="submit"
          disabled={busy || code.replace(/\s/g, '').length !== 6}
          className="rounded-btn bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-ink disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      )}
      {!dead && (
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="justify-self-start text-sm font-semibold text-primary underline disabled:opacity-50"
        >
          Resend code
        </button>
      )}
    </form>
  );
}
