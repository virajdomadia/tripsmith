'use client';

import { ArrowRight, CalendarClock, CircleCheck, Info, ShieldCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { changeDate, loadChangeOptions } from '@/lib/account';
import { TEST_MODE_MAX_PAISE } from '@/lib/booking';
import {
  type ChangeOffer,
  type ChangeOption,
  type ChangeOptions,
  confirmLabel,
  differenceLabel,
  feeRule,
  moneyLine,
  seatsLabel,
} from '@/lib/change';
import { formatDate, inr } from '@/lib/format';
import { type CheckoutSuccess, loadCheckout, openCheckout } from '@/lib/razorpay-checkout';

type Phase =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'picking'; options: ChangeOptions }
  | { kind: 'moving'; options: ChangeOptions }
  | { kind: 'paying'; options: ChangeOptions }
  | { kind: 'confirming'; options: ChangeOptions }
  | { kind: 'done'; date: string; refundPaise: number; paidPaise: number };

const json = { 'Content-Type': 'application/json' };

/**
 * My trips → Change of plans (R45, P7; My trip D's rail card). The card states the fee rule in
 * dates; "Change date" opens a sheet of the trip's other dates, each re-quoted by the server for
 * this booking (the earned discounts kept in ₹, today's fee, pay now or money back). Picking
 * one and confirming either moves the booking at once, or — when the price rises — holds the
 * new date's seats for 10 minutes and opens Razorpay for exactly the difference; the move is
 * made by the same capture as every payment (callback, sync on close, webhook), once.
 */
export function ChangeDatePanel({
  bookingRef,
  offer,
  contact,
  packageName,
}: {
  bookingRef: string;
  offer: ChangeOffer;
  contact: { name: string; email: string; phone: string };
  packageName: string;
}) {
  const router = useRouter();
  const id = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [picked, setPicked] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const options = 'options' in phase ? phase.options : null;
  const choice = options?.options.find((o) => o.departureId === picked) ?? null;
  const busy = phase.kind === 'moving' || phase.kind === 'confirming';

  async function open() {
    setProblem(null);
    setPicked(null);
    setPhase({ kind: 'loading' });
    const res = await loadChangeOptions(bookingRef);
    if (!res.ok) {
      setPhase({ kind: 'failed', message: res.error.message });
      if (res.error.reason === 'change_closed') router.refresh();
      return;
    }
    setPhase({ kind: 'picking', options: res.data });
  }

  async function post(path: 'confirm' | 'sync', body: unknown) {
    const res = await fetch(`/api/bookings/${encodeURIComponent(bookingRef)}/${path}`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify(body),
    }).catch(() => undefined);
    return !!res?.ok;
  }

  /** Where the booking stands now: the date it departs on (null when it can't be read). */
  async function departsNow(): Promise<string | null> {
    const res = await fetch(`/api/account/bookings/${encodeURIComponent(bookingRef)}`, {
      cache: 'no-store',
    }).catch(() => undefined);
    if (!res?.ok) return null;
    const b = (await res.json().catch(() => null)) as { departs?: string } | null;
    return b?.departs ?? null;
  }

  async function settle(
    opts: ChangeOptions,
    o: ChangeOption,
    orderId: string,
    paid?: CheckoutSuccess,
  ) {
    setPhase({ kind: 'confirming', options: opts });
    const confirmed =
      (paid &&
        (await post('confirm', {
          razorpayOrderId: paid.razorpay_order_id,
          razorpayPaymentId: paid.razorpay_payment_id,
          razorpaySignature: paid.razorpay_signature,
        }))) ||
      false;
    // Closed without the callback, the payment may still have gone through: the sync applies it.
    const synced = confirmed || (await post('sync', { orderId }));
    const departs = await departsNow();
    router.refresh();
    if (departs === o.date) {
      setPhase({ kind: 'done', date: o.date, refundPaise: 0, paidPaise: o.payNowPaise });
      return;
    }
    if (paid && (confirmed || synced) && departs) {
      // Paid, but the move was not made (the seats went after the hold): the money goes back.
      setProblem(
        `Your payment arrived after the hold on ${formatDate(o.date)} had ended, so the change couldn’t be made — your trip stays as it was and the ${inr(o.payNowPaise)} is on its way back.`,
      );
    } else if (paid) {
      setProblem(
        'We couldn’t confirm that payment yet. If money left your account, the move shows here within a few minutes — or WhatsApp us.',
      );
    } else {
      setProblem('Payment not finished — the new date’s seats stay held for 10 minutes.');
    }
    setPhase({ kind: 'picking', options: opts });
  }

  async function move() {
    if (!options || !choice || busy) return;
    setProblem(null);
    setPhase({ kind: 'moving', options });
    const res = await changeDate(bookingRef, choice.departureId, choice.netPaise);
    if (!res.ok) {
      setProblem(res.error.message);
      if (res.error.reason === 'price_changed' || res.error.reason === 'sold_out') {
        const fresh = await loadChangeOptions(bookingRef);
        if (fresh.ok) {
          setPhase({ kind: 'picking', options: fresh.data });
          return;
        }
      }
      if (res.error.reason === 'change_closed') router.refresh();
      setPhase({ kind: 'picking', options });
      return;
    }
    const result = res.data;
    if (result.state === 'done') {
      router.refresh();
      setPhase({ kind: 'done', date: result.date, refundPaise: result.refundPaise, paidPaise: 0 });
      return;
    }
    try {
      await loadCheckout();
    } catch {
      setProblem('The payment window didn’t load. Check your connection and try again.');
      setPhase({ kind: 'picking', options });
      return;
    }
    // The sheet steps aside while Razorpay's window is up (Radix's modal would trap focus).
    setPhase({ kind: 'paying', options });
    let closed = false;
    const orderId = result.orderId ?? '';
    openCheckout(
      {
        key: result.keyId ?? '',
        order_id: orderId,
        amount: result.payNowPaise,
        currency: 'INR',
        name: 'Tripsmith',
        description: `Date change · ${packageName} · ${bookingRef}`,
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
            void settle(options, choice, orderId);
          },
        },
        handler: (payment) => {
          closed = true;
          void settle(options, choice, orderId, payment);
        },
      },
      (description) => setProblem(description ?? 'The payment didn’t go through.'),
    );
  }

  const sheetOpen = phase.kind !== 'closed' && phase.kind !== 'paying';

  return (
    <section aria-labelledby={`${id}-h`} className="grid gap-3 rounded-card border border-line p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-[12px] bg-primary-soft text-primary">
          <CalendarClock className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="text-[15px]">
            Change date
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-ink2">
            {offer.open ? feeRule(offer) : offer.reason}
          </p>
          {offer.open && (
            <p className="mt-1 text-[12px] text-mute">
              Same travellers, any other date of this trip. One online change per booking.
            </p>
          )}
        </div>
      </div>
      {offer.open && (
        <button
          type="button"
          onClick={() => void open()}
          className="inline-flex items-center justify-center gap-2 rounded-btn border-[1.5px] border-ink px-4 py-2.5 text-[14px] font-bold transition-colors hover:bg-ink hover:text-white"
        >
          <CalendarClock className="size-4" aria-hidden /> Change date
        </button>
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={(next) => {
          if (!next && !busy) setPhase({ kind: 'closed' });
        }}
      >
        <SheetContent className="sm:w-[min(560px,100%)]">
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
            <header className="flex items-center gap-3 border-b border-line px-4.5 py-3.5 pt-[max(14px,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <SheetTitle className="text-base font-extrabold tracking-tight">
                  Change your date
                </SheetTitle>
                <SheetDescription className="text-[13px] font-semibold text-mute">
                  {options
                    ? `${packageName} · now ${formatDate(options.currentDate)} · ${options.party} ${
                        options.party === 1 ? 'traveller' : 'travellers'
                      }`
                    : packageName}
                </SheetDescription>
              </div>
              <SheetClose
                aria-label="Close"
                disabled={busy}
                className="ml-auto grid size-10 flex-none place-items-center rounded-[10px] border-[1.5px] border-line transition-colors hover:border-ink"
              >
                <X className="size-5" />
              </SheetClose>
            </header>

            <div className="grid min-h-0 content-start gap-4 overflow-y-auto overscroll-contain p-4.5">
              {phase.kind === 'loading' && (
                <p role="status" className="text-[14px] text-mute">
                  Finding the other dates…
                </p>
              )}
              {phase.kind === 'failed' && (
                <p role="alert" className="text-[14px] font-semibold text-warn">
                  {phase.message}
                </p>
              )}
              {phase.kind === 'done' && <Moved phase={phase} />}
              {options && phase.kind !== 'done' && (
                <>
                  {options.feePaise > 0 && (
                    <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn">
                      A change today costs {inr(options.feePaise)} ({inr(100_000)} per traveller) —
                      it’s in every price below.
                    </p>
                  )}
                  {options.options.length === 0 ? (
                    <p className="text-[14px] text-ink2">
                      This trip has no other dates open right now — WhatsApp us and we’ll see what
                      we can do.
                    </p>
                  ) : (
                    <fieldset className="grid gap-2">
                      <legend className="label-caps mb-2 text-mute">Pick the new date</legend>
                      {options.options.map((o) => (
                        <DateCard
                          key={o.departureId}
                          option={o}
                          name={`${id}-date`}
                          checked={picked === o.departureId}
                          onPick={() => {
                            setPicked(o.departureId);
                            setProblem(null);
                          }}
                        />
                      ))}
                    </fieldset>
                  )}
                  {choice && <Summary choice={choice} currentFare={options.currentFarePaise} />}
                </>
              )}
            </div>

            {options && phase.kind !== 'done' && (
              <footer className="grid gap-2 border-t border-line p-4.5 pb-[max(18px,env(safe-area-inset-bottom))]">
                {problem && (
                  <p role="alert" className="text-[13px] font-bold text-warn">
                    {problem}
                  </p>
                )}
                {choice && choice.payNowPaise > TEST_MODE_MAX_PAISE && (
                  <p className="flex gap-2 text-[12px] text-ink2">
                    <Info className="mt-0.5 size-3.5 flex-none" aria-hidden />
                    Razorpay’s test mode takes at most {inr(TEST_MODE_MAX_PAISE)} in one payment, so
                    this one stops at Razorpay’s window.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void move()}
                  disabled={!choice || busy}
                  aria-busy={busy}
                  className="inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-5 py-3 text-[15px] font-bold text-white transition-[background-color,opacity] hover:bg-primary-ink disabled:pointer-events-none disabled:opacity-45"
                >
                  {choice && choice.payNowPaise > 0 ? (
                    <ShieldCheck className="size-4.5" aria-hidden />
                  ) : (
                    <ArrowRight className="size-4.5" aria-hidden />
                  )}
                  {phase.kind === 'moving'
                    ? 'Moving your trip…'
                    : phase.kind === 'confirming'
                      ? 'Checking payment…'
                      : choice
                        ? confirmLabel(choice)
                        : 'Pick a date'}
                </button>
                <p className="text-center text-[12px] text-mute">
                  {choice && choice.payNowPaise > 0
                    ? 'The new date’s seats are held for 10 minutes while you pay. Your trip moves once the payment lands.'
                    : 'Your trip moves straight away — a new voucher follows by email.'}
                </p>
              </footer>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function DateCard({
  option: o,
  name,
  checked,
  onPick,
}: {
  option: ChangeOption;
  name: string;
  checked: boolean;
  onPick: () => void;
}) {
  const tone =
    o.differencePaise > 0 ? 'text-warn' : o.differencePaise < 0 ? 'text-ok' : 'text-mute';
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-[14px] border-[1.5px] px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-200 ${
        !o.bookable
          ? 'cursor-not-allowed border-line bg-bg2 opacity-60'
          : checked
            ? 'border-primary bg-primary-soft shadow-[0_0_0_3px_var(--color-primary-soft)]'
            : 'border-line hover:border-ink'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={!o.bookable}
        onChange={onPick}
        className="size-4 accent-[var(--color-primary)]"
      />
      <span className="grid min-w-0 flex-1">
        <b className="text-[15px]">{formatDate(o.date)}</b>
        <span className="text-[12.5px] text-mute">{seatsLabel(o)}</span>
      </span>
      <span className="grid justify-items-end text-right">
        <b className={`num text-[14px] ${tone}`}>{differenceLabel(o)}</b>
        {o.bookable && <span className="text-[12px] text-ink2">{moneyLine(o)}</span>}
      </span>
    </label>
  );
}

function Summary({ choice, currentFare }: { choice: ChangeOption; currentFare: number }) {
  const rows: [string, string][] = [
    ['Your fare now', inr(currentFare)],
    [`Fare on ${formatDate(choice.date)}`, inr(choice.farePaise)],
  ];
  if (choice.feePaise) rows.push(['Change fee', inr(choice.feePaise)]);
  rows.push(['New trip total', inr(choice.totalPaise)]);
  return (
    <section
      aria-label="What the change costs"
      className="grid gap-1.5 rounded-[14px] bg-bg2 p-4 text-[14px] animate-rise"
    >
      <p className="text-[12px] text-mute">
        Your deal, early-bird and coupon savings stay exactly as they are — only the base fare
        changes.
      </p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-ink2">{k}</span>
          <span className="num font-semibold">{v}</span>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t-[1.5px] border-ink pt-2">
        <b>
          {choice.payNowPaise > 0
            ? 'To pay now'
            : choice.refundPaise > 0
              ? 'Back to you'
              : 'To pay now'}
        </b>
        <b className="num text-[22px] tracking-tight">
          {inr(choice.payNowPaise || choice.refundPaise)}
        </b>
      </div>
      {choice.balancePaise > 0 && (
        <p className="text-[12.5px] text-ink2">
          Then {inr(choice.balancePaise)} left to pay
          {choice.dueOn ? `, due by ${formatDate(choice.dueOn)}` : ''}.
        </p>
      )}
      {choice.refundPaise > 0 && (
        <p className="text-[12.5px] text-ink2">
          Refunded to the way you paid — banks take 5–7 working days to show it.
        </p>
      )}
    </section>
  );
}

function Moved({ phase }: { phase: Extract<Phase, { kind: 'done' }> }) {
  return (
    <div role="status" className="grid justify-items-center gap-3 py-8 text-center animate-rise">
      <span className="grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
        <CircleCheck className="size-8" aria-hidden />
      </span>
      <h3 className="text-[22px] tracking-tight">Moved to {formatDate(phase.date)}</h3>
      <p className="max-w-[36ch] text-[14px] text-ink2">
        {phase.paidPaise > 0 && `Payment of ${inr(phase.paidPaise)} received. `}
        {phase.refundPaise > 0 && `${inr(phase.refundPaise)} is on its way back to you. `}
        Your new voucher is on this page and in your inbox.
      </p>
      <SheetClose className="rounded-btn bg-ink px-5 py-2.5 font-bold text-white">Done</SheetClose>
    </div>
  );
}
