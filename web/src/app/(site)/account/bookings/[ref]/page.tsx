import { ArrowLeft, FileDown } from 'lucide-react';
import { Documents } from '@/components/site/account/Documents';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Activity } from '@/components/site/account/Activity';
import { BalancePanel } from '@/components/site/account/BalancePanel';
import { CancelPanel } from '@/components/site/account/CancelPanel';
import { ChangeDatePanel } from '@/components/site/account/ChangeDatePanel';
import { ReviewPanel } from '@/components/site/account/ReviewPanel';
import { PILL } from '@/components/site/account/TripRow';
import { Container } from '@/components/site/Container';
import { WhatsApp } from '@/components/site/home/icons';
import { bookingState, countdown, daysBetween, istDay, voucherHref } from '@/lib/account';
import { api, ApiRequestError } from '@/lib/api';
import { ACCOUNT_PATH, ACCOUNT_SIGN_IN } from '@/lib/auth/gate';
import { BookedAddons } from '@/components/site/booking/BookedAddons';
import { ExtrasPanel } from '@/components/site/account/ExtrasPanel';
import { HolidayPass } from '@/components/site/account/HolidayPass';
import { TravellerDetails } from '@/components/site/account/TravellerDetails';
import { TripCoupons } from '@/components/site/account/TripCoupons';
import { isDiscountLine, lineLabel, OCCUPANCY_LABEL } from '@/lib/booking';
import { whatsappHref } from '@/lib/business';
import { duration, formatDate, inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false },
};

const REF = /^TB-[A-Z0-9]{6}$/;

/**
 * One booking on My trips (R18, R19): the trip, when, who, what was paid for what, the voucher,
 * and the cancellation block — the policy tier that applies today, and the request form while
 * a request can still be made. A completed trip leads with its review (R21, B13), and the
 * booking's customer-safe history closes the page as "Activity" (R54, P16). A booking made on
 * a deposit leads with its balance: paid, left, due by, and Pay now in parts (R43, P5). The rail
 * offers Change date (R45, P7) above the cancellation block. While the trip is paid for and
 * ahead, the header is the holiday pass and the work before the trip is a column of tear-off
 * coupons — traveller details, the balance, the trip's own checklist (R49, P9).
 */
export default async function BookingPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!REF.test(ref)) notFound();
  let b;
  try {
    b = await api('/account/bookings/{ref}', { auth: true, params: { ref } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) redirect(ACCOUNT_SIGN_IN);
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const state = bookingState({ ...b, cancellation: b.cancellation?.status ?? null });
  const daysOut = daysBetween(b.today, b.departs);
  const upcoming = daysOut >= 0 && b.status !== 'cancelled' && b.status !== 'pending';
  const pass = upcoming && b.readiness ? b.readiness : null;
  const balancePanel = b.balance &&
    (b.status === 'partially_paid' || (b.status === 'confirmed' && upcoming)) && (
      <BalancePanel
        // A new balance after a part is paid starts the amount afresh.
        key={b.balance.balancePaise}
        bookingRef={b.ref}
        balance={b.balance}
        paidPaise={b.paidPaise}
        totalPaise={b.totalPaise}
        today={b.today}
        contact={{ name: b.leadName, email: b.leadEmail, phone: b.leadPhone }}
        packageName={b.packageName}
      />
    );
  const wa = whatsappHref(`Hi Tripsmith, about my booking ${b.ref} (${b.packageName}).`);

  return (
    <Container className="max-w-[1040px] pt-6 pb-16">
      <Link
        href={ACCOUNT_PATH}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-mute no-underline hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> My trips
      </Link>

      {pass ? (
        <HolidayPass b={b} readiness={pass} state={state} />
      ) : (
        <header className="relative mt-4 overflow-hidden rounded-card bg-ink text-white">
          {b.coverUrl && (
            <Image
              src={b.coverUrl}
              alt=""
              fill
              priority
              sizes="(min-width: 1040px) 1040px, 100vw"
              className={`object-cover opacity-60 ${b.status === 'cancelled' ? 'grayscale' : ''}`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
          <div className="relative grid gap-3 p-5 pt-24 sm:p-8 sm:pt-32">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-chip px-2.5 py-0.5 text-[12px] font-bold ${PILL[state.tone]}`}
              >
                {state.label}
              </span>
              <span className="rounded-md border border-dashed border-white/40 px-2 py-0.5 text-[12px] font-extrabold tracking-[0.06em]">
                {b.ref}
              </span>
            </div>
            <h1 className="max-w-[22ch] text-[clamp(28px,4.4vw,46px)] text-white">
              {b.packageName}
            </h1>
            <p className="text-[15px] text-white/85">
              {b.destination} · {duration(b.nights, b.days)} · {b.departureCity}
            </p>
            {upcoming && (
              <p className="num text-[22px] font-extrabold tracking-tight text-action">
                {countdown(b.today, b.departs)}
              </p>
            )}
          </div>
        </header>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="grid gap-6">
          <ReviewPanel
            bookingRef={b.ref}
            packageName={b.packageName}
            review={b.review ?? null}
            canReview={b.canReview}
          />
          {pass ? (
            <TripCoupons
              bookingRef={b.ref}
              readiness={pass}
              details={<TravellerDetails bookingRef={b.ref} block={b.details} />}
              balance={balancePanel || null}
              locksOn={b.details.locksOn}
              departs={b.departs}
              balanceDueOn={b.balance?.dueOn ?? null}
            />
          ) : (
            balancePanel
          )}
          <section className="rounded-card border border-line p-5" aria-labelledby="when">
            <h2 id="when" className="text-[18px]">
              When
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Fact k="Departs" v={formatDate(b.departs)} />
              <Fact k="Back" v={formatDate(b.returns)} />
              <Fact k="Booked" v={formatDate(istDay(b.bookedAt))} />
            </dl>
          </section>

          <section className="rounded-card border border-line p-5" aria-labelledby="who">
            <h2 id="who" className="text-[18px]">
              Who’s travelling
            </h2>
            <ul className="mt-3 grid gap-2">
              {b.travellers.map((t, i) => (
                <li
                  key={`${t.name}-${i}`}
                  className="flex items-center justify-between gap-3 border-t border-line pt-2 first:border-0 first:pt-0"
                >
                  <span className="font-semibold">
                    {t.name}{' '}
                    {t.age != null && <span className="font-normal text-mute">· {t.age}</span>}
                  </span>
                  <span className="text-[13px] text-mute">{OCCUPANCY_LABEL[t.occupancy]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-[14px] text-ink2">
              Lead: <b className="text-ink">{b.leadName}</b> · {b.leadPhone} · {b.leadEmail}
            </p>
          </section>

          <section className="rounded-card border border-line p-5" aria-labelledby="price">
            <h2 id="price" className="text-[18px]">
              What you paid for
            </h2>
            <div className="mt-3 grid gap-1.5 text-[15px]">
              {b.quote.lines.map((l) => (
                <div
                  key={`${l.kind}-${l.occupancy}`}
                  className={`flex justify-between gap-3 ${isDiscountLine(l) ? 'font-bold text-ok' : ''}`}
                >
                  <span className={isDiscountLine(l) ? '' : 'text-ink2'}>
                    {lineLabel(l, b.quote.deal?.label)} · {l.count} × {l.unitPaise < 0 ? '−' : ''}
                    {inr(Math.abs(l.unitPaise))}
                  </span>
                  <span className="num shrink-0 whitespace-nowrap">
                    {l.amountPaise < 0 ? '−' : ''}
                    {inr(Math.abs(l.amountPaise))}
                  </span>
                </div>
              ))}
              {b.quote.coupon && (
                <div className="flex justify-between gap-3 font-bold text-ok">
                  <span>
                    Coupon <span className="font-mono tracking-wide">{b.quote.coupon.code}</span>
                  </span>
                  <span className="num shrink-0 whitespace-nowrap">
                    −{inr(b.quote.coupon.offPaise)}
                  </span>
                </div>
              )}
              {b.quote.manual && (
                <div className="flex justify-between gap-3 font-bold text-ok">
                  <span className="min-w-0">
                    Discount
                    <span className="block text-[12px] font-semibold text-mute">
                      {b.quote.manual.reason}
                    </span>
                  </span>
                  <span className="num shrink-0 whitespace-nowrap">
                    −{inr(b.quote.manual.offPaise)}
                  </span>
                </div>
              )}
              {b.quote.changeFeePaise > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-ink2">Date-change fee</span>
                  <span className="num shrink-0 whitespace-nowrap">
                    {inr(b.quote.changeFeePaise)}
                  </span>
                </div>
              )}
              <BookedAddons quote={b.quote} addons={b.addons ?? []} />
              <div className="mt-1 flex items-baseline justify-between border-t-[1.5px] border-ink pt-2.5">
                <span className="font-bold">Total</span>
                <span className="num text-[24px] font-extrabold tracking-tight">
                  {inr(b.totalPaise)}
                </span>
              </div>
            </div>
            {b.payments.length > 0 && (
              <ul className="mt-4 grid gap-1 rounded-btn bg-bg2 p-3 text-[13px] text-ink2">
                {b.payments.map((p) => (
                  <li key={p.reference ?? p.paidAt} className="flex justify-between gap-3">
                    <span>
                      Paid {formatDate(istDay(p.paidAt))} ·{' '}
                      {p.provider === 'razorpay' ? 'Razorpay' : 'Offline'}
                      {p.reference && <span className="num text-mute"> · {p.reference}</span>}
                    </span>
                    <b className="num text-ink">{inr(p.amountPaise)}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {b.extras && (b.extras.open || ['confirmed', 'partially_paid'].includes(b.status)) && (
            <section className="rounded-card border border-line p-5" aria-labelledby="extras">
              <h2 id="extras" className="text-[18px]">
                Add extras
              </h2>
              <p className="mt-1 mb-3 text-[14px] text-ink2">
                Make the trip yours — each extra is priced for your booking, paid at full price.
              </p>
              <ExtrasPanel
                bookingRef={b.ref}
                extras={b.extras}
                party={b.travellers.length}
                contact={{ name: b.leadName, email: b.leadEmail, phone: b.leadPhone }}
                packageName={b.packageName}
              />
            </section>
          )}
          <Activity entries={b.activity} />
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-24">
          <div className="grid gap-2 rounded-card border border-line p-5">
            {b.hasVoucher && (
              <a
                href={voucherHref(b.ref)}
                className="inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-4 py-3 font-bold text-white no-underline transition-colors hover:bg-primary-ink"
              >
                <FileDown className="size-4.5" aria-hidden /> Download voucher (PDF)
              </a>
            )}
            <a
              href={wa}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center gap-2 rounded-btn bg-wa px-4 py-3 font-bold text-white no-underline transition-[filter] hover:brightness-110"
            >
              <WhatsApp className="size-4.5" /> WhatsApp us about this trip
            </a>
            <Link href={`/packages/${b.packageSlug}`} className="text-center text-sm font-semibold">
              See the trip’s page
            </Link>
          </div>
          {b.documents.length > 0 && (
            <section className="grid gap-3 rounded-card border border-line p-5">
              <h2 className="text-[15px]">GST documents</h2>
              <Documents bookingRef={b.ref} documents={b.documents} />
              <p className="text-[12px] text-mute">
                Prices include GST at 5%. Each document is numbered when it’s issued: the receipt
                when you pay, the tax invoice once the trip is paid in full, a credit note when a
                refund goes out.
              </p>
            </section>
          )}
          {upcoming && (b.status === 'confirmed' || b.status === 'partially_paid') && (
            <ChangeDatePanel
              bookingRef={b.ref}
              offer={b.change}
              contact={{ name: b.leadName, email: b.leadEmail, phone: b.leadPhone }}
              packageName={b.packageName}
            />
          )}
          <CancelPanel
            bookingRef={b.ref}
            status={b.status}
            cancellation={b.cancellation ?? null}
            canRequest={b.canRequestCancellation}
            daysOut={daysOut}
          />
        </aside>
      </div>
    </Container>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label-caps text-mute">{k}</dt>
      <dd className="m-0 font-bold">{v}</dd>
    </div>
  );
}
