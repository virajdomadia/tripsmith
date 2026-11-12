'use client';

import { type FormEvent, useId, useState } from 'react';
import { errorFromResponse } from '@/lib/api-errors';
import { EMAIL_RE } from '@/lib/contact-rules';

export type AlertTarget = { target: 'package' | 'destination'; slug: string; name: string };

const FAILED = 'Couldn’t save that just now — try again in a moment.';

/**
 * "Email me when new dates are added" (v3 C3, R30): offered in the concierge when nothing can be
 * booked, and on a package page with no upcoming dates. One email when the owner adds dates, then
 * the alert closes — so the copy says "once", and there is nothing to unsubscribe from.
 */
export function NotifyMe({
  offer,
  compact = false,
}: {
  offer: AlertTarget;
  /** The chat's narrower card. */
  compact?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const id = useId();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const key = offer.target === 'package' ? 'packageSlug' : 'destinationSlug';
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, [key]: offer.slug }),
      });
      if (res.status === 201) {
        setDone(true);
      } else {
        const err = errorFromResponse(
          res.status,
          res.statusText,
          await res.json().catch(() => undefined),
        );
        setError(
          err.body.code === 'rate_limited'
            ? 'Too many tries from this connection — try again in a few minutes.'
            : err.body.code === 'validation' || err.body.code === 'not_found'
              ? (err.body.fieldErrors?.email ?? err.body.message)
              : FAILED,
        );
      }
    } catch {
      setError(FAILED);
    }
    setBusy(false);
  }

  if (done)
    return (
      <p
        role="status"
        className={`rounded-card border border-ok/40 bg-ok-soft text-ink ${compact ? 'p-3 text-[14px]' : 'p-4'}`}
      >
        <b>Done.</b> We’ll email you once when new dates for {offer.name} are added.
      </p>
    );

  return (
    <form
      onSubmit={submit}
      noValidate
      data-notify-me
      className={`grid gap-2 rounded-card border border-line bg-bg2 ${compact ? 'p-3' : 'p-4'}`}
    >
      <label
        htmlFor={`${id}-email`}
        className={`font-bold text-ink ${compact ? 'text-[14px]' : ''}`}
      >
        Email me when new dates are added for {offer.name}
      </label>
      <div className="flex gap-2">
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-btn border-[1.5px] border-line bg-bg px-3 py-2 text-[15px] text-ink placeholder:text-mute focus:border-primary aria-invalid:border-warn"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-btn bg-primary px-3.5 py-2 text-[14px] font-bold text-white hover:bg-primary-ink disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Notify me'}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-semibold text-warn">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-mute">
          One email, once. No newsletter.
        </p>
      )}
    </form>
  );
}
