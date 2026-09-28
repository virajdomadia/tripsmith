'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Check, ChevronDown, Info, Lock, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { WhatsApp } from '@/components/site/home/icons';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  adultsIn,
  formErrors,
  holdSecondsLeft,
  TEST_MODE_MAX_PAISE,
  TEST_MODE_TRIPS,
} from '@/lib/booking';
import { whatsappHref } from '@/lib/business';
import { formatDate, inr } from '@/lib/format';
import { AnimatedPrice } from './AnimatedPrice';
import { BookingDone } from './BookingDone';
import { ContactFields } from './ContactFields';
import { CouponField } from './CouponField';
import { MakeItYours } from './MakeItYours';
import { DeparturePicker } from './DeparturePicker';
import { PartyBuilder } from './PartyBuilder';
import { PriceBreakdown } from './PriceBreakdown';
import { type BookingFlow, type BookingPackage, useBooking } from './use-booking';

gsap.registerPlugin(useGSAP);

/**
 * Book now — v2.5 mockup B, "wide sheet + live receipt": a full-height sheet over the package
 * page (full screen on a phone). The steps — date, travellers, Make it yours (P8, when the trip
 * has add-ons), contact — scroll on the left; the server's price, the coupon and Pay sit in a
 * receipt beside them, which on a phone is a drawer along the bottom. Closing the sheet keeps
 * every choice: the flow's state lives here, and this component stays mounted once opened.
 *
 * Motion: the panel slides in on `--ease-out` (sheet.tsx), the steps rise in one after another,
 * each step's number turns into a tick once it is complete, and the total counts to each new
 * quote. All of it stands still under reduced motion.
 */
export function BookingSheet({
  pkg,
  open,
  onOpenChange,
}: {
  pkg: BookingPackage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const flow = useBooking(pkg, open);
  const { phase, quote, departure, slots, travellers, contact } = flow;
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!open || !scope.current) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(scope.current!.querySelectorAll('[data-step]'), {
          y: 18,
          opacity: 0,
          duration: 0.55,
          ease: 'power3.out',
          stagger: 0.07,
          delay: 0.18,
          clearProps: 'transform,opacity',
        });
      });
    },
    { scope, dependencies: [open] },
  );

  // A failed check moves focus to the first field it marked.
  useEffect(() => {
    if (flow.focusRequest === 0) return;
    scope.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [flow.focusRequest]);

  // Scroll back to the dates when one sold out under the visitor.
  useEffect(() => {
    if (flow.gone)
      scope.current?.querySelector('[data-scroll]')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [flow.gone]);

  const errs = formErrors(slots, travellers, contact);
  const extras = flow.offered.length > 0;
  const picked = quote.status === 'ok' ? (quote.quote.addons ?? []).length : 0;
  const done = {
    date: !!departure && !flow.reason,
    party:
      !!departure && !flow.reason && !Object.keys(errs).some((k) => k.startsWith('travellers.')),
    extras: picked > 0,
    contact: !Object.keys(errs).some((k) => k.startsWith('contact.')),
  };
  const adults = adultsIn(flow.rooms);
  const partyWords = `${adults} ${adults === 1 ? 'adult' : 'adults'}${
    flow.rooms.children
      ? `, ${flow.rooms.children} ${flow.rooms.children === 1 ? 'child' : 'children'}`
      : ''
  }`;
  const finished =
    phase.kind === 'done' || phase.kind === 'confirming' || phase.kind === 'unconfirmed';
  const total =
    quote.status === 'ok'
      ? quote.quote.totalPaise
      : quote.status === 'loading'
        ? quote.last?.totalPaise
        : undefined;

  return (
    // While Razorpay's window is up the sheet steps aside: a Radix modal sets `pointer-events:
    // none` on <body> and traps focus, which would lock the visitor out of Checkout's iframe.
    // Dismissed or paid, the sheet slides back with every choice intact.
    <Sheet open={open && phase.kind !== 'paying'} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[min(920px,100%)]">
        <div ref={scope} className="grid h-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <header className="flex items-center gap-3 border-b border-line px-4.5 py-3.5 pt-[max(14px,env(safe-area-inset-top))]">
            {pkg.cover && (
              <div className="relative size-13 flex-none overflow-hidden rounded-[10px] bg-line">
                <Image src={pkg.cover.url} alt="" fill sizes="52px" className="object-cover" />
              </div>
            )}
            <div className="min-w-0">
              <SheetTitle className="truncate text-base font-extrabold tracking-tight">
                {pkg.name}
              </SheetTitle>
              <SheetDescription className="text-[13px] font-semibold text-mute">
                {pkg.duration} · Book now
              </SheetDescription>
            </div>
            <SheetClose
              aria-label="Close"
              className="ml-auto grid size-10 flex-none place-items-center rounded-[10px] border-[1.5px] border-line transition-colors hover:border-ink"
            >
              <X className="size-5" />
            </SheetClose>
          </header>

          {finished ? (
            <div data-scroll className="grid content-start gap-6 overflow-y-auto p-4.5">
              <BookingDone
                pkg={pkg}
                order={phase.order}
                result={phase.kind === 'done' ? phase.result : undefined}
                confirming={phase.kind === 'confirming'}
                onRetry={phase.kind === 'unconfirmed' ? flow.retryConfirm : undefined}
                onStartOver={flow.startOver}
                lead={contact.name.trim()}
                email={contact.email.trim().toLowerCase()}
                travellers={partyWords}
              />
            </div>
          ) : (
            <div className="relative grid min-h-0 md:grid-cols-[minmax(0,1fr)_340px]">
              <div
                data-scroll
                className="grid min-h-0 content-start gap-6 overflow-y-auto overscroll-contain p-4.5 max-md:pb-44"
              >
                {flow.gone && (
                  <div
                    role="alert"
                    className="grid gap-1.5 rounded-btn border-[1.5px] border-warn bg-warn-soft p-3 animate-rise"
                  >
                    <b className="text-warn">{flow.gone} is no longer available</b>
                    <span className="text-sm">
                      Someone booked the last seats in the meantime. You haven’t been charged. Pick
                      another date — your travellers are kept.
                    </span>
                  </div>
                )}
                {flow.banner && (
                  <p
                    role="alert"
                    className="rounded-btn border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn"
                  >
                    {flow.banner}{' '}
                    <a
                      href={whatsappHref(`Hi Tripsmith, I'd like to book ${pkg.name}.`)}
                      target="_blank"
                      rel="noopener"
                      className="underline"
                    >
                      WhatsApp us
                    </a>
                  </p>
                )}
                <Step n={1} title="Pick a date" done={done.date}>
                  <DeparturePicker flow={flow} slug={pkg.slug} />
                </Step>
                <Step n={2} title="Who’s travelling" done={done.party}>
                  <PartyBuilder flow={flow} />
                </Step>
                {extras && (
                  <Step
                    n={3}
                    title="Make it yours"
                    done={done.extras}
                    aside={
                      done.extras
                        ? `${picked} ${picked === 1 ? 'extra' : 'extras'}`
                        : 'Optional · priced as you tap'
                    }
                  >
                    <MakeItYours flow={flow} />
                  </Step>
                )}
                <Step n={extras ? 4 : 3} title="Contact" done={done.contact}>
                  <ContactFields flow={flow} />
                </Step>
                <p
                  data-step
                  className="flex gap-2.5 rounded-btn bg-primary-soft px-3 py-2.5 text-[13px] leading-relaxed text-primary-ink"
                >
                  <Info className="mt-0.5 size-4 flex-none" aria-hidden />
                  <span>
                    <b>Demo site.</b> Payments run in Razorpay test mode — no real money moves. Use
                    a Razorpay test card or UPI ID <b>success@razorpay</b>. Bookings are visible to
                    anyone using the public demo login, so use a made-up name and phone. Emails are
                    real: the voucher goes to the address you give — use one ending in{' '}
                    <b>@example.com</b> to keep it on screen only. Razorpay’s test mode takes
                    payments up to {inr(TEST_MODE_MAX_PAISE)}, so a bigger booking stops at
                    Razorpay’s window; every step before it is live.{' '}
                    <Link href="/privacy#demo" className="whitespace-nowrap text-primary-ink">
                      Privacy
                    </Link>
                  </span>
                </p>
              </div>
              <Receipt flow={flow} pkg={pkg} total={total} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Book now B's live receipt: the server's price, the coupon, and Pay — beside the steps on a
 * wide screen; on a phone, a drawer along the bottom that shows the total and Pay and opens to
 * the full breakdown.
 */
function Receipt({
  flow,
  pkg,
  total,
}: {
  flow: BookingFlow;
  pkg: BookingPackage;
  total: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const { phase, party, departure } = flow;
  // On a phone the drawer starts closed; a price or code problem must not hide inside it.
  const problem = flow.quote.status === 'error' || !!flow.coupon.error;
  useEffect(() => {
    if (problem) setOpen(true);
  }, [problem]);
  const when = `${party} ${party === 1 ? 'traveller' : 'travellers'}${
    departure ? ` · ${formatDate(departure.date)}` : ''
  }`;
  const price =
    total !== undefined ? (
      <AnimatedPrice paise={total} className="text-[22px] font-extrabold tracking-tight" />
    ) : (
      <b className="text-[22px] font-extrabold tracking-tight text-mute">—</b>
    );
  return (
    <aside
      aria-label="Your price"
      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-[#fbfcfe] md:border-l md:border-line max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:max-h-[88%] max-md:rounded-t-[18px] max-md:border-t max-md:border-line max-md:bg-bg max-md:shadow-[0_-18px_40px_-22px_rgb(0_0_0/0.4)]"
    >
      <div className="flex items-center justify-between gap-2.5 px-4.5 pt-3.5 pb-1 max-md:px-3.5 max-md:pt-3">
        <div className="min-w-0 leading-tight">
          <span className="block truncate text-[12.5px] text-mute">{when}</span>
          <span className="md:hidden">{price}</span>
          <h3 className="mt-0.5 text-[17px] max-md:hidden">Your price</h3>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="receipt-body"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-[13px] font-bold text-primary md:hidden"
        >
          {open ? 'Hide details' : 'Price and payment'}
          <ChevronDown
            aria-hidden
            className={`size-4 transition-transform duration-300 ease-(--ease-out) motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      <div
        id="receipt-body"
        className={`grid min-h-0 content-start gap-3.5 overflow-y-auto overscroll-contain px-4.5 pt-2 pb-4 max-md:px-3.5 ${open ? '' : 'max-md:hidden'}`}
      >
        <PriceBreakdown flow={flow} />
        {flow.quote.status !== 'idle' && <CouponField flow={flow} />}
      </div>
      <div className="grid gap-2 border-t border-line bg-bg px-4.5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] max-md:px-3.5">
        {total !== undefined && total > TEST_MODE_MAX_PAISE && (
          <p className="rounded-[10px] bg-warn-soft px-2.5 py-1.5 text-center text-[12.5px] font-semibold text-warn">
            Demo limit: Razorpay’s test mode takes up to {inr(TEST_MODE_MAX_PAISE)}, so this payment
            will stop at Razorpay. For a full test payment, try{' '}
            {TEST_MODE_TRIPS.filter((t) => t.slug !== pkg.slug).map((t, i, all) => (
              <span key={t.slug}>
                <a href={`/packages/${t.slug}#book`} className="underline">
                  {t.name}
                </a>
                {i < all.length - 1 ? ' or ' : '.'}
              </span>
            ))}
          </p>
        )}
        <button
          type="button"
          onClick={() => void flow.pay()}
          disabled={!flow.canPay}
          aria-busy={flow.busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-action px-5 py-3.5 text-[15px] font-bold text-ink shadow-[0_8px_20px_-10px_rgb(242_169_59/0.8)] transition-[background-color,transform,opacity] duration-300 ease-(--ease-out) hover:-translate-y-0.5 hover:bg-action-ink disabled:pointer-events-none disabled:opacity-45"
        >
          {phase.kind === 'starting' ? (
            <Spinner label="Holding your seats…" />
          ) : phase.kind === 'opening' || phase.kind === 'paying' ? (
            <Spinner label="Opening payment…" />
          ) : phase.kind === 'checking' ? (
            <Spinner label="Checking payment…" />
          ) : (
            <>
              {phase.kind === 'dismissed' ? 'Pay again' : 'Pay'}
              {total !== undefined && flow.canPay && (
                // The receipt announces the total; the button's accessible name stays "Pay".
                <span aria-hidden className="num">
                  {inr(total)}
                </span>
              )}
            </>
          )}
        </button>
        {phase.kind === 'dismissed' ? (
          <HoldNote expiresAt={phase.order.holdExpiresAt} failure={phase.failure} />
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-mute">
            <Lock className="size-3.5" aria-hidden /> Seats held for 10 minutes once you press Pay
          </span>
        )}
      </div>
    </aside>
  );
}

function Step({
  n,
  title,
  done,
  aside,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section data-step aria-labelledby={`step-${n}`} className="grid gap-2.5">
      <header className="flex items-baseline gap-2.5">
        <span
          aria-hidden
          className={`grid size-6 flex-none translate-y-[3px] place-items-center rounded-lg text-xs font-extrabold text-white transition-colors duration-300 ${done ? 'bg-ok' : 'bg-ink'}`}
        >
          {done ? (
            <Check className="size-3.5 animate-in zoom-in-50 duration-300" strokeWidth={3} />
          ) : (
            n
          )}
        </span>
        <h3 id={`step-${n}`} className="text-[17px]">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h3>
        {aside && (
          <span className="ml-auto text-[12.5px] font-semibold whitespace-nowrap text-mute">
            {aside}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <>
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink motion-reduce:animate-none"
      />
      <span>{label}</span>
    </>
  );
}

/** After Checkout was closed unpaid: how long the seats stay held, and why it closed. */
function HoldNote({ expiresAt, failure }: { expiresAt: string; failure?: string }) {
  const [left, setLeft] = useState(() => holdSecondsLeft(expiresAt));
  useEffect(() => {
    const t = setInterval(() => setLeft(holdSecondsLeft(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <p role="status" className="text-center text-[12.5px] font-semibold text-ink2">
      {failure ? <span className="block text-warn">{failure}</span> : null}
      {left > 0 ? (
        <>
          Payment window closed. Your seats are held for <span className="num">{mmss}</span> — press
          Pay again to finish.
        </>
      ) : (
        <>Your hold ended and the seats went back. Pay again to hold them afresh.</>
      )}{' '}
      <a
        href={whatsappHref('Hi Tripsmith, I had trouble paying for a booking.')}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1"
      >
        <WhatsApp className="size-3.5 text-wa" /> Need help?
      </a>
    </p>
  );
}
