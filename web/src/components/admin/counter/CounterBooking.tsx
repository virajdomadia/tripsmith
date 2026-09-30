'use client';

import { Check, ChevronLeft, ChevronRight, Inbox, Info } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHead } from '@/components/admin/PageHead';
import { Button } from '@/components/ui/button';
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { adminRequest } from '@/lib/admin/client';
import {
  CHANNEL_LABEL,
  blockers,
  bookingBody,
  counterAddonChoices,
  counterTravellers,
  manualInput,
  type CounterPackage,
  type Customer,
  type Draft,
} from '@/lib/admin/counter';
import { reportAdminError } from '@/lib/admin/errors';
import { partySize, slotsFor, type Rooms } from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Done } from './Done';
import { Receipt } from './Receipt';
import {
  AddonsStep,
  CustomerStep,
  DiscountsStep,
  PartyStep,
  SettleStep,
  TravellersStep,
  TripStep,
} from './steps';
import { useCounterQuote } from './useCounterQuote';

export type EnquiryPrefill = {
  id: string;
  ref: string;
  status: string;
  name: string;
  phone: string;
  email: string;
  packageSlug: string | null;
  travelMonth: string | null;
  adults: number;
  children: number;
  message: string | null;
  createdAt: string;
  bookings: string[];
};

const STEPS = [
  ['Trip', 'Pick the departure. The counter can sell until departure morning.'],
  ['Party', 'The party is capped at the seats left on this date.'],
  ['Add-ons', 'Priced by the server; never discounted.'],
  ['Discounts', 'Deal and early-bird apply on their own. Manual discounts need a reason.'],
  ['Customer', 'Find them by phone, email or name, or create a new customer.'],
  ['Travellers', 'Names now, or fill them in later from the booking.'],
  ['Settle', 'Record the payment, or take the deposit now.'],
] as const;

/** The party an enquiry asked for, in rooms: pairs share doubles, three share a triple, one
 *  travels single. The owner adjusts it on the Party step. */
function roomsFor(adults: number, children: number): Rooms {
  const a = Math.max(1, adults);
  if (a % 2 === 0) return { double: a / 2, triple: 0, single: 0, children };
  if (a === 1) return { double: 0, triple: 0, single: 1, children };
  return { double: (a - 3) / 2, triple: 1, single: 0, children };
}

function initialDraft(packages: CounterPackage[], e: EnquiryPrefill | null): Draft {
  const pkg = e?.packageSlug ? packages.find((p) => p.slug === e.packageSlug) : undefined;
  const month = e?.travelMonth?.slice(0, 7);
  const dep =
    pkg?.departures.find(
      (d) => !d.onRequest && d.seatsLeft > 0 && month && d.date.startsWith(month),
    ) ?? null;
  return {
    departureId: dep?.id ?? null,
    rooms: e ? roomsFor(e.adults, e.children) : { double: 1, triple: 0, single: 0, children: 0 },
    names: {},
    detailsNow: false,
    picks: {},
    coupon: null,
    manual: { mode: 'inr', value: '', reason: '' },
    customer: e
      ? { kind: 'new', draft: { name: e.name, phone: e.phone, email: e.email, state: '' } }
      : null,
    settle: 'paid',
    method: 'upi',
    reference: '',
    channel: e ? 'enquiry' : 'phone',
  };
}

/**
 * Counter booking (R56, P18) as mockup C: a seven-stop rail, one big step card at a time, and
 * the server's quote as a printed receipt beside it (after the card on a phone). Every change
 * re-prices through `quoteCounterBooking`; the last step books and settles in one call, and the
 * receipt takes its "Paid" stamp.
 */
export function CounterBooking({
  packages,
  enquiry,
  owner,
}: {
  packages: CounterPackage[];
  enquiry: EnquiryPrefill | null;
  owner: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(packages, enquiry));
  const [packageId, setPackageId] = useState<string | null>(() => {
    const byEnquiry = enquiry?.packageSlug
      ? packages.find((p) => p.slug === enquiry.packageSlug)
      : undefined;
    return byEnquiry?.id ?? packages[0]?.id ?? null;
  });
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<AdminBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const departure = pkg?.departures.find((d) => d.id === draft.departureId) ?? null;
  const party = partySize(draft.rooms);
  const kidsReady = slotsFor(draft.rooms)
    .filter((s) => s.occupancy === 'child')
    .every((s) => /^\d+$/.test(draft.names[s.key]?.age ?? ''));
  const email = draft.customer
    ? draft.customer.kind === 'match'
      ? draft.customer.match.email
      : draft.customer.draft.email.trim().toLowerCase()
    : null;

  const request = useMemo(() => {
    if (!departure || !pkg || party === 0 || !kidsReady) return null;
    return {
      departureId: departure.id,
      travellers: counterTravellers(draft.rooms, draft.names),
      couponCode: draft.coupon,
      email,
      addons: counterAddonChoices(pkg.addons, draft.picks, party),
      manual: manualInput(draft.manual),
    };
  }, [departure, pkg, party, kidsReady, draft, email]);

  const { quote, error, loading, requote } = useCounterQuote(request, {
    onCouponRefused: (message) => {
      setCouponMsg(message);
      setDraft((d) => ({ ...d, coupon: null }));
    },
  });

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const pending = blockers(draft, !!quote?.deposit);
  if (request && error && !error.coupon) pending.unshift(error.message);

  const summaries = [
    departure ? `${formatDate(departure.date)} · ${departure.seatsLeft} left` : 'Not picked',
    party ? `${party} traveller${party === 1 ? '' : 's'}` : 'Nobody yet',
    quote?.addons.length
      ? `${quote.addons.length} add-on${quote.addons.length === 1 ? '' : 's'} · ${inr(quote.addonsPaise)}`
      : 'None',
    quote ? (quote.discountPaise ? `−${inr(quote.discountPaise)}` : 'None') : '—',
    draft.customer
      ? draft.customer.kind === 'match'
        ? draft.customer.match.name
        : draft.customer.draft.name || 'New customer'
      : 'Not picked',
    draft.detailsNow ? 'Entering now' : 'Later',
    draft.settle === 'paid' ? 'Paid now' : 'Deposit now',
  ];

  async function submit() {
    if (!quote || pending.length || !request) return;
    setBusy(true);
    try {
      const body = {
        ...bookingBody(draft, enquiry?.id ?? null),
        addons: request.addons,
        // The total on the receipt: the api refuses (409 price_changed) if it has moved since.
        expectedTotalPaise: quote.totalPaise,
      };
      const booked = await adminRequest<AdminBooking>('/admin/counter/bookings', {
        method: 'POST',
        body,
      });
      setDone(booked);
      router.refresh();
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not book — try again' });
      // Whatever refused it (price, seats, coupon), show the owner today's numbers.
      requote();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const amountNow = quote
    ? draft.settle === 'deposit'
      ? quote.deposit?.amountPaise
      : quote.totalPaise
    : null;
  const cta =
    draft.settle === 'paid'
      ? `Record ${amountNow ? inr(amountNow) : ''} & confirm`
      : `Record deposit ${amountNow ? inr(amountNow) : ''} & confirm`;

  const rail = done ? STEPS.length - 1 : step;
  const railRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // On a phone the rail scrolls inside itself: keep the current stop in view.
    railRef.current
      ?.querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [step]);
  const [title, why] = STEPS[step]!;
  const body = [
    <TripStep
      key="trip"
      packages={packages}
      packageId={packageId}
      onPackage={(id) => {
        setPackageId(id);
        set({ departureId: null, picks: {} });
      }}
      departureId={draft.departureId}
      onDeparture={(id) => set({ departureId: id })}
    />,
    <PartyStep
      key="party"
      rooms={draft.rooms}
      names={draft.names}
      seatsLeft={departure?.seatsLeft ?? null}
      date={departure?.date ?? null}
      onRooms={(rooms) => set({ rooms })}
      onNames={(names) => set({ names })}
    />,
    <AddonsStep
      key="addons"
      offered={pkg?.addons ?? []}
      picks={draft.picks}
      party={party}
      onPick={(id, n) => set({ picks: { ...draft.picks, [id]: n } })}
    />,
    <DiscountsStep
      key="disc"
      quote={quote}
      coupon={draft.coupon}
      couponMsg={couponMsg}
      onCoupon={(code) => {
        setCouponMsg(null);
        set({ coupon: code });
      }}
      manual={draft.manual}
      manualError={error?.manual ?? null}
      onManual={(manual) => set({ manual })}
    />,
    <CustomerStep
      key="cust"
      customer={draft.customer}
      initialQuery={enquiry?.email ?? ''}
      onCustomer={(customer: Customer | null) => set({ customer })}
    />,
    <TravellersStep
      key="trav"
      rooms={draft.rooms}
      names={draft.names}
      detailsNow={draft.detailsNow}
      lead={summaries[4]!}
      onDetailsNow={(detailsNow) => set({ detailsNow })}
      onNames={(names) => set({ names })}
    />,
    <SettleStep
      key="settle"
      quote={quote}
      draft={draft}
      owner={owner}
      enquiryRef={enquiry?.ref ?? null}
      onChange={set}
    />,
  ][step];

  return (
    <div className="grid gap-4">
      <PageHead
        title="New booking"
        subtitle="Counter booking · step by step, with the server’s receipt beside you"
        actions={
          <Link
            href="/admin/bookings"
            className="px-2 py-1.5 text-sm font-bold text-mute no-underline hover:text-ink"
          >
            Back to bookings
          </Link>
        }
      />
      {enquiry && <EnquiryBanner enquiry={enquiry} bookedRef={done?.ref ?? null} />}
      <ol
        ref={railRef}
        className="ctr-rail"
        style={{ '--p': rail / (STEPS.length - 1) } as React.CSSProperties}
        aria-label="Steps"
      >
        {STEPS.map(([t], k) => {
          const past = done ? true : k < step;
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => !done && setStep(k)}
                aria-current={k === step && !done ? 'step' : undefined}
                className={cn(past && 'past')}
                disabled={!!done}
              >
                <span className="dot">
                  {past ? <Check className="size-4" aria-hidden /> : k + 1}
                </span>
                <b>{t}</b>
                <small>{summaries[k]}</small>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {done ? (
            <Done
              booking={done}
              onNew={() => {
                if (enquiry) router.push('/admin/bookings/new');
                setDraft(initialDraft(packages, null));
                setDone(null);
                setStep(0);
                setCouponMsg(null);
              }}
            />
          ) : (
            <section
              key={step}
              className="ctr-big grid gap-[18px] rounded-[20px] border border-line bg-bg p-5 sm:px-7 sm:py-6"
              aria-labelledby="ctr-step-title"
            >
              <header>
                <span className="label-caps text-[11px] text-mute">
                  Step {step + 1} of {STEPS.length}
                </span>
                <h2
                  id="ctr-step-title"
                  className="mt-1 text-[26px] leading-tight font-extrabold sm:text-[30px]"
                >
                  {title}
                </h2>
                <p className="mt-1.5 font-semibold text-mute">{why}</p>
              </header>
              <div className="min-w-0">{body}</div>
              <footer className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
                {step > 0 ? (
                  <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                    <ChevronLeft className="size-4" aria-hidden />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={() => setStep(step + 1)}>
                    Next: {STEPS[step + 1]![0]}
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                ) : (
                  <div className="grid w-full max-w-[380px] gap-2 sm:w-auto sm:flex-[0_1_380px]">
                    {pending.length > 0 && (
                      <ul className="grid gap-1 text-[13px] font-bold text-warn">
                        {pending.map((b) => (
                          <li key={b} className="flex items-start gap-1.5">
                            <Info className="mt-0.5 size-3.5 flex-none" aria-hidden />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      disabled={busy || loading || !quote || pending.length > 0}
                      onClick={submit}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-btn bg-action px-5 py-3 text-[15px] font-bold text-ink shadow-[0_8px_20px_-10px_rgb(242_169_59/0.8)] transition-[background-color,transform,opacity] duration-300 ease-(--ease-out) hover:-translate-y-0.5 hover:bg-action-ink disabled:pointer-events-none disabled:opacity-45"
                    >
                      <Check className="size-4" aria-hidden />
                      {busy ? 'Booking…' : cta}
                    </button>
                    <p className="text-[12.5px] text-mute">
                      Voucher, receipt and emails go out exactly as for web bookings.
                    </p>
                  </div>
                )}
              </footer>
            </section>
          )}
        </div>
        <aside aria-label="Quote" className="lg:sticky lg:top-3">
          <Receipt
            quote={quote}
            loading={loading}
            error={request ? (error?.message ?? null) : null}
            pkg={pkg}
            date={departure?.date ?? null}
            customer={summaries[4] === 'Not picked' ? null : summaries[4]!}
            state={
              draft.customer?.kind === 'match'
                ? (draft.customer.match.state ?? null)
                : draft.customer?.draft.state || null
            }
            reason={draft.manual.reason.trim()}
            footer={`${CHANNEL_LABEL[draft.channel]} · ${owner}`}
            waiting={
              !departure
                ? 'Pick a departure and the party — the server prices it here.'
                : !kidsReady
                  ? 'Enter each child’s age on the Party step — it sets the child rate.'
                  : 'Add at least one adult on the Party step.'
            }
            done={done}
          />
        </aside>
      </div>
    </div>
  );
}

function EnquiryBanner({
  enquiry,
  bookedRef,
}: {
  enquiry: EnquiryPrefill;
  bookedRef: string | null;
}) {
  const converted = enquiry.status === 'converted' && !bookedRef;
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-card border px-4 py-3 text-[13.5px]',
        converted ? 'border-warn/40 bg-warn-soft' : 'border-primary/30 bg-primary-soft/50',
      )}
    >
      <Inbox className="mt-0.5 size-4 flex-none text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <b>
          Converting enquiry <Link href={`/admin/enquiries?sel=${enquiry.id}`}>{enquiry.ref}</Link>
        </b>{' '}
        · {enquiry.name} asked on {formatDate(enquiry.createdAt.slice(0, 10))}
        {enquiry.message
          ? `: “${enquiry.message.slice(0, 140)}${enquiry.message.length > 140 ? '…' : ''}”`
          : ''}
        <span className="block text-mute">
          {converted
            ? `Already converted${enquiry.bookings[0] ? ` to ${enquiry.bookings[0]}` : ''} — booking again will be refused.`
            : 'Trip, party and customer are pre-filled from it; booking marks the enquiry converted and links it.'}
        </span>
      </div>
      <span
        className={cn(
          'rounded-full px-2.5 py-0.5 text-[12px] font-bold',
          bookedRef ? 'bg-ok-soft text-ok' : 'bg-bg text-primary',
        )}
      >
        {bookedRef ? `Converted · ${bookedRef}` : 'Will mark converted'}
      </span>
    </div>
  );
}
