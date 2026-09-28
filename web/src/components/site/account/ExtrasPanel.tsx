'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddonMenu } from '@/components/site/booking/MakeItYours';
import { type ExtrasQuote, orderExtras, quoteExtras } from '@/lib/account';
import type { components } from '@/lib/api-types';
import {
  addonChoices,
  type AddonChoice,
  addonDetail,
  type AddonPicks,
  isAddonGone,
  TEST_MODE_MAX_PAISE,
} from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';
import { type CheckoutSuccess, loadCheckout, openCheckout } from '@/lib/razorpay-checkout';

type ExtrasOffer = components['schemas']['ExtrasOffer'];
type Quoted =
  | { status: 'idle' }
  | { status: 'loading'; last?: ExtrasQuote }
  | { status: 'ok'; quote: ExtrasQuote }
  | { status: 'error'; message: string };
type Stage = 'choose' | 'ordering' | 'paying' | 'confirming' | 'done';

const json = { 'Content-Type': 'application/json' };

/**
 * My trips → Add extras (R46, P8b): the add-ons this booking does not have yet, picked with the
 * Book-now sheet's controls, priced by the server on every change, and paid through Razorpay
 * Checkout on an order for exactly that price. The payment is applied by the same capture as the
 * booking's (the callback, the sync on close, the webhook), so paying twice or replaying never
 * adds an add-on twice. Closed 7 days before departure, or while a cancellation is asked.
 */
export function ExtrasPanel({
  bookingRef,
  extras,
  party,
  contact,
  packageName,
}: {
  bookingRef: string;
  extras: ExtrasOffer;
  party: number;
  contact: { name: string; email: string; phone: string };
  packageName: string;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<AddonPicks>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quoted>({ status: 'idle' });
  const [stage, setStage] = useState<Stage>('choose');
  const [problem, setProblem] = useState<string | null>(null);
  const offered = useMemo(() => extras.offered.filter((a) => !gone.has(a.id)), [extras, gone]);
  const choices = useMemo(() => addonChoices(offered, picks, party), [offered, picks, party]);
  const key = JSON.stringify(choices);

  const drop = useCallback(
    (fieldErrors: Record<string, string> | undefined, sent: AddonChoice[]) => {
      const k = Object.keys(fieldErrors ?? {}).find((f) => f.startsWith('addons.'));
      const id = sent[Number(k?.split('.')[1])]?.addonId;
      if (id) {
        setGone((g) => new Set(g).add(id));
        setPicks((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      } else setPicks({});
    },
    [],
  );

  useEffect(() => {
    const sent = JSON.parse(key) as AddonChoice[];
    if (!sent.length) {
      setQuote({ status: 'idle' });
      return;
    }
    let live = true;
    setQuote((q) => ({
      status: 'loading',
      last: q.status === 'ok' ? q.quote : q.status === 'loading' ? q.last : undefined,
    }));
    const timer = setTimeout(async () => {
      const res = await quoteExtras(bookingRef, sent);
      if (!live) return;
      if (res.ok) setQuote({ status: 'ok', quote: res.data });
      else if (isAddonGone(res.error.reason ?? undefined)) {
        setNotice(res.error.message);
        drop(res.error.fieldErrors, sent);
      } else setQuote({ status: 'error', message: res.error.message });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, bookingRef, drop]);

  if (!extras.open)
    return (
      <p className="text-[14px] text-ink2">
        {extras.reason ?? 'Extras are closed for this booking.'}
      </p>
    );

  const q = quote.status === 'ok' ? quote.quote : quote.status === 'loading' ? quote.last : null;
  const busy = stage !== 'choose';

  async function settle(orderId: string, payment?: CheckoutSuccess) {
    setStage('confirming');
    const path = payment ? 'confirm' : 'sync';
    const body = payment
      ? {
          razorpayOrderId: payment.razorpay_order_id,
          razorpayPaymentId: payment.razorpay_payment_id,
          razorpaySignature: payment.razorpay_signature,
        }
      : { orderId };
    await fetch(`/api/bookings/${encodeURIComponent(bookingRef)}/${path}`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify(body),
    }).catch(() => undefined);
    setPicks({});
    setStage(payment ? 'done' : 'choose');
    router.refresh();
  }

  async function pay() {
    if (!choices.length || busy) return;
    setProblem(null);
    setStage('ordering');
    const res = await orderExtras(bookingRef, choices);
    if (!res.ok) {
      if (isAddonGone(res.error.reason ?? undefined)) {
        setNotice(res.error.message);
        drop(res.error.fieldErrors, choices);
      } else setProblem(res.error.message);
      setStage('choose');
      return;
    }
    const order = res.data;
    try {
      await loadCheckout();
    } catch {
      setProblem('The payment window didn’t load. Check your connection and try again.');
      setStage('choose');
      return;
    }
    setStage('paying');
    let closed = false;
    openCheckout(
      {
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: 'INR',
        name: 'Tripsmith',
        description: `Extras · ${packageName} · ${bookingRef}`,
        prefill: { name: contact.name, email: contact.email, contact: contact.phone },
        notes: { booking_ref: bookingRef },
        theme: { color: '#1B4FD8' },
        retry: { enabled: true },
        modal: {
          confirm_close: true,
          escape: true,
          ondismiss: () => {
            if (closed) return;
            closed = true;
            void settle(order.orderId); // paid anyway? the sync applies it once
          },
        },
        handler: (payment) => {
          closed = true;
          void settle(order.orderId, payment);
        },
      },
      (description) => setProblem(description ?? 'The payment didn’t go through.'),
    );
  }

  return (
    <div className="grid gap-3">
      {stage === 'done' && (
        <p
          role="status"
          className="rounded-[10px] bg-ok-soft px-3 py-2 text-[13.5px] font-bold text-ok"
        >
          Extras added — your voucher and the tax invoice for them are below.
        </p>
      )}
      <AddonMenu
        offered={offered}
        picks={picks}
        party={party}
        onPick={(id, n) => {
          setPicks((p) => ({ ...p, [id]: Math.max(0, n) }));
          setNotice(null);
          setStage((s) => (s === 'done' ? 'choose' : s));
        }}
        notice={notice}
      />
      {q && q.addons.length > 0 && (
        <div
          aria-busy={quote.status === 'loading'}
          className={`grid gap-1 text-sm transition-opacity ${quote.status === 'loading' ? 'opacity-55' : ''}`}
        >
          {q.addons.map((a) => (
            <div key={a.addonId ?? a.name} className="flex justify-between gap-3">
              <span className="text-ink2">
                {a.name} · {addonDetail(a)}
              </span>
              <span className="num">{inr(a.amountPaise)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t-[1.5px] border-ink pt-2 font-bold">
            <span>To pay now</span>
            <span className="num text-[20px] font-extrabold">{inr(q.totalPaise)}</span>
          </div>
        </div>
      )}
      {quote.status === 'error' && (
        <p role="alert" className="text-[13px] font-bold text-warn">
          {quote.message}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-[13px] font-bold text-warn">
          {problem}
        </p>
      )}
      {q && q.totalPaise > TEST_MODE_MAX_PAISE && (
        <p className="rounded-[10px] bg-warn-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-warn">
          Demo limit: Razorpay’s test mode takes up to {inr(TEST_MODE_MAX_PAISE)} a payment.
        </p>
      )}
      <button
        type="button"
        onClick={() => void pay()}
        disabled={!choices.length || quote.status !== 'ok' || busy}
        aria-busy={busy}
        className="inline-flex items-center justify-center gap-2 rounded-btn bg-action px-5 py-3 text-[15px] font-bold text-ink transition-[background-color,opacity] hover:bg-action-ink disabled:pointer-events-none disabled:opacity-45"
      >
        {stage === 'ordering'
          ? 'Starting payment…'
          : stage === 'paying'
            ? 'Paying…'
            : stage === 'confirming'
              ? 'Checking payment…'
              : 'Pay for extras'}
      </button>
      <p className="inline-flex items-center gap-1.5 text-[12.5px] text-mute">
        <Lock className="size-3.5" aria-hidden /> Open until {formatDate(extras.closesOn)} — 7 days
        before you leave. Extras follow the same cancellation terms as the trip.
      </p>
    </div>
  );
}
