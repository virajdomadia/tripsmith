'use client';

import { Check, Clock, FileDown, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { components } from '@/lib/api-types';
import { whatsappHref } from '@/lib/business';

type Callback = components['schemas']['LinkCallback'];
type Result = components['schemas']['PaymentResult'];
type State =
  { kind: 'checking' } | { kind: 'done'; result: Result } | { kind: 'failed'; message: string };

const BTN =
  'inline-flex items-center justify-center gap-2 rounded-btn px-4 py-3 font-bold no-underline transition-colors';

/**
 * Back from a paid payment link: the api verifies Razorpay's signature and confirms the booking
 * (P18b). A booking the link paid only in part (a deposit) says so; anything the api can't
 * verify points the customer to WhatsApp — the webhook confirms a real payment anyway.
 */
export function LinkReturn({ bookingRef, callback }: { bookingRef: string; callback: Callback }) {
  const [state, setState] = useState<State>({ kind: 'checking' });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingRef}/link-callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(callback),
          cache: 'no-store',
        });
        const body = await res.json().catch(() => undefined);
        if (!live) return;
        if (res.ok) setState({ kind: 'done', result: body as Result });
        else
          setState({
            kind: 'failed',
            message:
              body?.error?.message ??
              'We could not confirm that payment here — if money left your account, it will still reach us.',
          });
      } catch {
        if (live)
          setState({
            kind: 'failed',
            message: 'We could not reach Tripsmith just now — your payment is safe with Razorpay.',
          });
      }
    })();
    return () => {
      live = false;
    };
  }, [bookingRef, callback]);

  const wa = whatsappHref(`Hi Tripsmith, I paid the link for booking ${bookingRef}.`);
  if (state.kind === 'checking')
    return (
      <p role="status" className="flex items-center gap-2 text-[17px] font-bold text-ink2">
        <Clock className="size-5 animate-pulse" aria-hidden /> Checking your payment…
      </p>
    );
  if (state.kind === 'failed')
    return (
      <div className="grid max-w-md gap-4 text-center">
        <h1 className="text-[28px] leading-tight font-extrabold">We’re checking your payment</h1>
        <p className="text-ink2">{state.message}</p>
        <a href={wa} className={`${BTN} bg-wa text-white`}>
          <MessageCircle className="size-4" aria-hidden /> WhatsApp us about {bookingRef}
        </a>
      </div>
    );
  const r = state.result;
  const confirmed = r.status === 'confirmed' || r.status === 'partially_paid';
  if (r.status === 'cancelled')
    return (
      <div className="grid max-w-md gap-4 text-center">
        <h1 className="text-[28px] leading-tight font-extrabold">Sorry — the seats had gone</h1>
        <p className="text-ink2">
          {r.refundNeeded
            ? `Your payment reached us after the hold on ${bookingRef} ended and the seats were taken, so it is being refunded in full to the same account.`
            : `Booking ${bookingRef} is no longer active.`}{' '}
          We’d love to find you another date.
        </p>
        <a href={wa} className={`${BTN} bg-wa text-white`}>
          <MessageCircle className="size-4" aria-hidden /> WhatsApp us
        </a>
      </div>
    );
  return (
    <div className="grid max-w-md gap-4 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
        <Check className="size-7" aria-hidden />
      </span>
      <h1 className="text-[28px] leading-tight font-extrabold">
        {confirmed ? 'Paid — you’re booked' : 'Payment received'}
      </h1>
      <p className="text-ink2">
        {r.status === 'partially_paid'
          ? `Your deposit is in and booking ${bookingRef} is confirmed. The balance is due by the date in your email; pay it any time from My trips.`
          : confirmed
            ? `Booking ${bookingRef} is confirmed. The voucher and receipt are on their way to your email.`
            : `We have your payment for ${bookingRef}; the team will confirm it shortly.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {r.voucherUrl && (
          <a
            href={`/api${r.voucherUrl}`}
            className={`${BTN} bg-action text-ink hover:bg-action-ink`}
          >
            <FileDown className="size-4" aria-hidden /> Voucher PDF
          </a>
        )}
        <Link
          href="/account"
          className={`${BTN} border border-line text-ink hover:border-ink ${r.voucherUrl ? '' : 'sm:col-span-2'}`}
        >
          My trips
        </Link>
      </div>
    </div>
  );
}
