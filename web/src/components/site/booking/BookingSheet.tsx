'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Check, Info, Lock, X } from 'lucide-react';
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
import { DeparturePicker } from './DeparturePicker';
import { PartyBuilder } from './PartyBuilder';
import { PriceBreakdown } from './PriceBreakdown';
import { type BookingPackage, useBooking } from './use-booking';

gsap.registerPlugin(useGSAP);

/**
 * Book now — B0 variant B: a full-height sheet over the package page (full screen on a phone),
 * the four steps in one scroll, the total and Pay pinned in the footer. Closing it keeps every
 * choice: the flow's state lives here, and this component stays mounted once opened.
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
  const { phase, quote, departure, slots, travellers, contact, party } = flow;
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
  const done = {
    date: !!departure && !flow.reason,
    party:
      !!departure && !flow.reason && !Object.keys(errs).some((k) => k.startsWith('travellers.')),
    price: quote.status === 'ok',
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
      <SheetContent>
        <div ref={scope} className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
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

          <div
            data-scroll
            className="grid content-start gap-6 overflow-y-auto overscroll-contain p-4.5"
          >
            {finished ? (
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
            ) : (
              <>
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
                <Step n={3} title="Price" done={done.price}>
                  <PriceBreakdown flow={flow} />
                  {flow.quote.status !== 'idle' && <CouponField flow={flow} />}
                </Step>
                <Step n={4} title="Contact" done={done.contact}>
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
                    anyone using the public demo login, so use made-up details. Razorpay’s test mode
                    takes payments up to {inr(TEST_MODE_MAX_PAISE)}, so a bigger booking stops at
                    Razorpay’s window; every step before it is live.{' '}
                    <Link href="/privacy#demo" className="whitespace-nowrap text-primary-ink">
                      Privacy
                    </Link>
                  </span>
                </p>
              </>
            )}
          </div>

          {!finished && (
            <footer className="grid gap-2 border-t border-line bg-bg px-4.5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {total !== undefined && total > TEST_MODE_MAX_PAISE && (
                <p className="rounded-[10px] bg-warn-soft px-2.5 py-1.5 text-center text-[12.5px] font-semibold text-warn">
                  Demo limit: Razorpay’s test mode takes up to {inr(TEST_MODE_MAX_PAISE)}, so this
                  payment will stop at Razorpay. For a full test payment, try{' '}
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
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 leading-tight">
                  <span className="block truncate text-[12.5px] text-mute">
                    {party} {party === 1 ? 'traveller' : 'travellers'}
                    {departure ? ` · ${formatDate(departure.date)}` : ''}
                  </span>
                  {total !== undefined ? (
                    <AnimatedPrice
                      paise={total}
                      className="text-[24px] font-extrabold tracking-tight"
                    />
                  ) : (
                    <b className="text-[24px] font-extrabold tracking-tight text-mute">—</b>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void flow.pay()}
                  disabled={!flow.canPay}
                  aria-busy={flow.busy}
                  className="inline-flex min-w-36 items-center justify-center gap-2 rounded-btn bg-action px-5 py-3.5 text-[15px] font-bold text-ink shadow-[0_8px_20px_-10px_rgb(242_169_59/0.8)] transition-[background-color,transform,opacity] duration-300 ease-(--ease-out) hover:-translate-y-0.5 hover:bg-action-ink disabled:pointer-events-none disabled:opacity-45"
                >
                  {phase.kind === 'starting' ? (
                    <Spinner label="Holding your seats…" />
                  ) : phase.kind === 'opening' || phase.kind === 'paying' ? (
                    <Spinner label="Opening payment…" />
                  ) : phase.kind === 'checking' ? (
                    <Spinner label="Checking payment…" />
                  ) : phase.kind === 'dismissed' ? (
                    'Pay again'
                  ) : (
                    'Pay'
                  )}
                </button>
              </div>
              {phase.kind === 'dismissed' ? (
                <HoldNote expiresAt={phase.order.holdExpiresAt} failure={phase.failure} />
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-mute">
                  <Lock className="size-3.5" aria-hidden /> Seats held for 10 minutes once you press
                  Pay
                </span>
              )}
            </footer>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
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
