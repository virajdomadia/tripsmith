'use client';

import { CircleCheck, Info, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { daysBetween, orderBalance } from '@/lib/account';
import type { components } from '@/lib/api-types';
import { TEST_MODE_MAX_PAISE } from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';
import { type CheckoutSuccess, loadCheckout, openCheckout } from '@/lib/razorpay-checkout';

type Balance = components['schemas']['AccountBalance'];
type Stage = 'choose' | 'ordering' | 'paying' | 'confirming' | 'done';

const json = { 'Content-Type': 'application/json' };
const rupees = (paise: number) => Math.round(paise / 100);
/** Digits only, shown with Indian grouping as the customer types (15,000). */
const grouped = (digits: string) => (digits ? Number(digits).toLocaleString('en-IN') : '');

/**
 * My trips → Balance (R43, P5; My trip D's pay card): what is paid, what is left and by when,
 * and "Pay now" for any part of it — at least ₹1,000 unless less is left. Each part is a
 * Razorpay order for exactly that amount, applied by the same capture as every payment (the
 * callback, the sync on close, the webhook), so a replay never counts twice; the part that
 * clears the balance confirms the booking and brings the tax invoice.
 */
export function BalancePanel({
  bookingRef,
  balance,
  paidPaise,
  totalPaise,
  today,
  contact,
  packageName,
}: {
  bookingRef: string;
  balance: Balance;
  paidPaise: number;
  totalPaise: number;
  today: string;
  contact: { name: string; email: string; phone: string };
  packageName: string;
}) {
  const router = useRouter();
  const id = useId();
  const left = balance.balancePaise;
  const [amount, setAmount] = useState(() => String(rupees(Math.min(left, TEST_MODE_MAX_PAISE))));

  const [stage, setStage] = useState<Stage>('choose');
  const [problem, setProblem] = useState<string | null>(null);
  const paidPct = totalPaise ? Math.min(100, Math.round((paidPaise / totalPaise) * 100)) : 0;

  if (left <= 0)
    return (
      <section
        aria-labelledby={`${id}-h`}
        className="grid gap-3 rounded-card border border-line p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="label-caps text-mute">Balance</span>
            <h2 id={`${id}-h`} className="text-[26px] tracking-tight">
              Paid in full
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-mute">
              <span className="num">{inr(totalPaise)}</span> paid · deposit{' '}
              <span className="num">{inr(balance.depositPaise)}</span> plus the balance
            </p>
          </div>
          <span className="grid size-11 place-items-center rounded-[14px] bg-ok-soft text-ok">
            <CircleCheck className="size-6" aria-hidden />
          </span>
        </div>
        <Meter pct={100} done />
      </section>
    );

  const wanted = Number(amount || 0) * 100;
  // The last part may be the exact balance even when it has paise; any other part whole rupees.
  // Within a rupee of the balance = the balance itself (a remainder may carry paise).
  const paying = Math.abs(wanted - left) < 100 ? left : wanted;
  const help =
    !wanted || paying < balance.minPartPaise
      ? { error: true, text: `Enter at least ${inr(balance.minPartPaise)}.` }
      : paying > left
        ? { error: true, text: `That’s more than the ${inr(left)} left to pay.` }
        : paying === left
          ? { error: false, text: 'This clears the balance — the tax invoice follows by email.' }
          : {
              error: false,
              text: `After this you’ll owe ${inr(left - paying)}, due by ${formatDate(balance.dueOn)}.`,
            };
  const daysLeft = daysBetween(today, balance.dueOn);
  const chips = [10_000_00, TEST_MODE_MAX_PAISE].filter(
    (v) => v < left && v >= balance.minPartPaise,
  );
  const busy = stage === 'ordering' || stage === 'paying' || stage === 'confirming';

  async function post(path: 'confirm' | 'sync', body: unknown) {
    const res = await fetch(`/api/bookings/${encodeURIComponent(bookingRef)}/${path}`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify(body),
    }).catch(() => undefined);
    return !!res?.ok;
  }

  async function settle(orderId: string, payment?: CheckoutSuccess) {
    setStage('confirming');
    const confirmed =
      (payment &&
        (await post('confirm', {
          razorpayOrderId: payment.razorpay_order_id,
          razorpayPaymentId: payment.razorpay_payment_id,
          razorpaySignature: payment.razorpay_signature,
        }))) ||
      false;
    const synced = confirmed || (await post('sync', { orderId }));
    router.refresh();
    if (payment && !confirmed && !synced) {
      setProblem(
        'We couldn’t confirm that payment yet. If money left your account, it shows here within a few minutes — or WhatsApp us.',
      );
      setStage('choose');
      return;
    }
    setStage(payment ? 'done' : 'choose');
  }

  async function pay() {
    if (help.error || busy) return;
    setProblem(null);
    setStage('ordering');
    const res = await orderBalance(bookingRef, paying);
    if (!res.ok) {
      setProblem(res.error.fieldErrors?.amountPaise ?? res.error.message);
      if (res.error.reason === 'balance_closed') router.refresh();
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
        description: `Balance · ${packageName} · ${bookingRef}`,
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
    <section
      aria-labelledby={`${id}-h`}
      className="grid gap-3.5 rounded-card border border-line p-5"
    >
      <div>
        <span className="label-caps text-mute">
          Balance due by {formatDate(balance.dueOn)}
          {daysLeft > 0
            ? ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
            : daysLeft === 0
              ? ' · today'
              : ' · overdue'}
        </span>
        <h2 id={`${id}-h`} className="num text-[34px] leading-[1.05] tracking-[-0.04em]">
          {inr(left)}
        </h2>
        <p className="mt-1 text-[12.5px] font-semibold text-mute">
          Paid <b className="num text-ink">{inr(paidPaise)}</b> of{' '}
          <span className="num">{inr(totalPaise)}</span> · reminders 7 and 3 days before, and on the
          day
        </p>
      </div>
      <Meter pct={paidPct} />
      {stage === 'done' && (
        <p
          role="status"
          className="rounded-[10px] bg-ok-soft px-3 py-2 text-[13.5px] font-bold text-ok"
        >
          Payment received — thank you. The receipt is under GST documents.
        </p>
      )}
      {daysLeft < 0 && (
        <p
          role="alert"
          className="rounded-[10px] bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn"
        >
          The due day has passed. Pay by {formatDate(balance.lastDayOn)} to keep the booking — after
          that it is cancelled under the cancellation policy.
        </p>
      )}
      {!balance.open ? (
        <p className="text-[14px] text-ink2">{balance.reason}</p>
      ) : (
        <>
          <div className="grid gap-2">
            <label htmlFor={`${id}-amt`} className="text-[12px] font-bold text-ink2">
              Pay now
            </label>
            <div className="flex items-center rounded-xl border-[1.5px] border-line bg-bg pl-3.5 focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)]">
              <span aria-hidden className="text-[22px] font-extrabold text-mute">
                ₹
              </span>
              <input
                id={`${id}-amt`}
                inputMode="numeric"
                autoComplete="off"
                value={grouped(amount)}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/\D/g, '').slice(0, 9));
                  setStage((s) => (s === 'done' ? 'choose' : s));
                }}
                aria-invalid={help.error}
                aria-describedby={`${id}-help`}
                className="num w-full min-w-0 border-0 bg-transparent py-2.5 pr-3 pl-1.5 text-[24px] font-extrabold tracking-[-0.02em] outline-none"
              />
            </div>
            <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-1.5">
              {[
                ...chips.map((v) => ({ v, label: inr(v) })),
                { v: left, label: `Full ${inr(left)}` },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={paying === v}
                  onClick={() => setAmount(String(rupees(v)))}
                  className={`num rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-bold transition-colors ${
                    paying === v
                      ? 'border-primary bg-primary-soft text-primary-ink'
                      : 'border-line bg-bg hover:border-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p
            id={`${id}-help`}
            aria-live="polite"
            className={`text-[12.5px] ${help.error ? 'font-semibold text-warn' : 'text-mute'}`}
          >
            {help.text}
          </p>
          {problem && (
            <p role="alert" className="text-[13px] font-bold text-warn">
              {problem}
            </p>
          )}
          <button
            type="button"
            onClick={() => void pay()}
            disabled={help.error || busy}
            aria-busy={busy}
            className="inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-5 py-3 text-[15px] font-bold text-white transition-[background-color,opacity] hover:bg-primary-ink disabled:pointer-events-none disabled:opacity-45"
          >
            <ShieldCheck className="size-4.5" aria-hidden />
            {stage === 'ordering'
              ? 'Starting payment…'
              : stage === 'paying'
                ? 'Paying…'
                : stage === 'confirming'
                  ? 'Checking payment…'
                  : `Pay ${help.error ? '' : inr(paying)}`.trim()}
          </button>
          <p className="flex items-start gap-2 rounded-[10px] bg-bg2 px-3 py-2.5 text-[12.5px] leading-snug text-ink2">
            <Info className="mt-0.5 size-4 flex-none" aria-hidden />
            <span>
              <b>Why pay in parts?</b> Any amount from {inr(balance.minPartPaise)} works. Razorpay’s
              test mode takes at most {inr(TEST_MODE_MAX_PAISE)} in one payment, so parts keep every
              payment under that cap. Each part shows in Activity straight away.
            </span>
          </p>
        </>
      )}
    </section>
  );
}

function Meter({ pct, done }: { pct: number; done?: boolean }) {
  return (
    <div
      role="img"
      aria-label={`${pct} percent paid`}
      className="h-2 overflow-hidden rounded-full bg-bg2"
    >
      <i
        className={`block h-full rounded-full transition-[width] duration-700 ease-(--ease-out) motion-reduce:transition-none ${
          done ? 'bg-ok' : 'bg-[linear-gradient(90deg,var(--color-primary),#4b77ea)]'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
