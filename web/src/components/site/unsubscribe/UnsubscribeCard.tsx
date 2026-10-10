'use client';

import { Check, Clock, MailX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { components } from '@/lib/api-types';

type Info = components['schemas']['Unsubscribe'];
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; info: Info }
  | { kind: 'saving'; info: Info }
  | { kind: 'bad'; message: string };

const BAD =
  'This unsubscribe link isn’t valid any more. Reply to any of our emails and we’ll take you off.';
const TOKEN = /^[A-Za-z0-9_-]+\.[a-z_]+\.[0-9a-f]{32}$/;

const BTN =
  'inline-flex items-center justify-center gap-2 rounded-btn px-4 py-3 font-bold no-underline transition-colors';

/** R53 (P15): read the link, then unsubscribe with one button (POST, idempotent). */
export function UnsubscribeCard({ token }: { token: string }) {
  const valid = TOKEN.test(token);
  const [state, setState] = useState<State>(
    valid ? { kind: 'loading' } : { kind: 'bad', message: BAD },
  );

  useEffect(() => {
    if (!valid) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/unsubscribe/${token}`, { cache: 'no-store' });
        const body = await res.json().catch(() => undefined);
        if (!live) return;
        setState(res.ok ? { kind: 'ready', info: body as Info } : { kind: 'bad', message: BAD });
      } catch {
        if (live) setState({ kind: 'bad', message: 'We couldn’t reach Tripsmith — try again.' });
      }
    })();
    return () => {
      live = false;
    };
  }, [token, valid]);

  async function unsubscribe(info: Info) {
    setState({ kind: 'saving', info });
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, { method: 'POST', cache: 'no-store' });
      const body = await res.json().catch(() => undefined);
      setState(res.ok ? { kind: 'ready', info: body as Info } : { kind: 'bad', message: BAD });
    } catch {
      setState({ kind: 'ready', info });
    }
  }

  if (state.kind === 'loading')
    return (
      <p role="status" className="flex items-center gap-2 text-[17px] font-bold text-ink2">
        <Clock className="size-5 animate-pulse" aria-hidden /> Checking the link…
      </p>
    );
  if (state.kind === 'bad')
    return (
      <div className="grid max-w-md gap-4 text-center">
        <h1 className="text-[28px] leading-tight font-extrabold">Link not recognised</h1>
        <p className="text-ink2">{state.message}</p>
        <Link href="/" className={`${BTN} border border-line text-ink hover:border-ink`}>
          Back to Tripsmith
        </Link>
      </div>
    );
  const { info } = state;
  if (info.unsubscribed)
    return (
      <div className="grid max-w-md gap-4 text-center" aria-live="polite">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="size-7" aria-hidden />
        </span>
        <h1 className="text-[28px] leading-tight font-extrabold">You’re unsubscribed</h1>
        <p className="text-ink2">
          No more {info.label} to {info.email}. Booking emails — confirmations, reminders about your
          trip and refunds — still reach you.
        </p>
        <Link href="/" className={`${BTN} border border-line text-ink hover:border-ink`}>
          Back to Tripsmith
        </Link>
      </div>
    );
  return (
    <div className="grid max-w-md gap-4 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-bg2 text-ink2">
        <MailX className="size-7" aria-hidden />
      </span>
      <h1 className="text-[28px] leading-tight font-extrabold">Stop {info.label}?</h1>
      <p className="text-ink2">
        We’ll stop sending {info.label} to <strong className="text-ink">{info.email}</strong>.
        Emails about trips you’ve booked keep coming.
      </p>
      <button
        type="button"
        onClick={() => void unsubscribe(info)}
        disabled={state.kind === 'saving'}
        className={`${BTN} bg-action text-ink hover:bg-action-ink disabled:opacity-60`}
      >
        {state.kind === 'saving' ? 'Unsubscribing…' : 'Unsubscribe'}
      </button>
    </div>
  );
}
