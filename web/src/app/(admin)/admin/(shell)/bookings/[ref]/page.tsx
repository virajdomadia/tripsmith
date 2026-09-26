import { ArrowLeft, FileDown, Mail, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { DeskActions } from '@/components/admin/bookings/DeskActions';
import { ResolveCancellation } from '@/components/admin/bookings/ResolveCancellation';
import { SeatStrip } from '@/components/admin/bookings/SeatStrip';
import { CancelRequested, RefundFlag, StateBadge } from '@/components/admin/bookings/StateBadge';
import { Timeline } from '@/components/admin/bookings/Timeline';
import { Stars } from '@/components/site/Stars';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { mailtoHref, telHref, waHref } from '@/lib/admin/enquiry-links';
import { buttonVariants } from '@/components/ui/button';
import { voucherHref } from '@/lib/account';
import { DESK_PATH, type AdminBooking } from '@/lib/admin/booking-filters';
import { reviewsHref } from '@/lib/admin/reviews';
import { api, ApiRequestError } from '@/lib/api';
import { lineLabel, OCCUPANCY_LABEL } from '@/lib/booking';
import { duration, formatDate, inr } from '@/lib/format';

export const metadata = { title: 'Booking' };

const REF = /^TB-[A-Z0-9]{6}$/;
const PROVIDER = { razorpay: 'Razorpay', offline: 'Offline' } as const;
const REVIEW_STATE = { pending: 'Waiting', published: 'Published', hidden: 'Hidden' } as const;

/** One booking on the desk (R22): who, what, the money, and what the owner can do about it. */
export default async function BookingPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!REF.test(ref)) notFound();
  let b;
  try {
    b = await api('/admin/bookings/{ref}', { auth: true, params: { ref } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const panel = 'grid gap-3 rounded-card border border-line bg-bg p-4';
  const heading = 'text-sm font-extrabold';
  const hello = `Hi ${b.leadName.split(' ')[0]}, this is Tripsmith about your booking ${b.ref} (${b.package.name}).`;
  return (
    <>
      <PageHead
        title={`${b.ref} · ${b.leadName}`}
        subtitle={`${b.package.name} · ${formatDate(b.departs)} · booked ${istFullDate(b.bookedAt)}`}
        actions={
          <>
            <a
              href={telHref(b.leadPhone)}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Phone className="size-4" aria-hidden />
              Call
            </a>
            <a
              href={waHref(b.leadPhone, hello)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
            <a
              href={mailtoHref(b.leadEmail, `Your Tripsmith booking ${b.ref}`)}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Mail className="size-4" aria-hidden />
              Email
            </a>
            <Link href={DESK_PATH} className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
              <ArrowLeft className="size-4" aria-hidden />
              Desk
            </Link>
          </>
        }
      />

      <div className="grid gap-3.5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="grid gap-3.5">
          <SeatStrip seats={b.departure} />

          <section className={panel}>
            <h2 className={heading}>
              Travellers <span className="font-semibold text-mute">· {b.travellers.length}</span>
            </h2>
            <ol className="grid gap-1.5">
              {b.travellers.map((t, i) => (
                <li
                  key={`${t.name}-${i}`}
                  className="flex justify-between gap-3 border-b border-line pb-1.5 last:border-0"
                >
                  <span className="text-sm font-bold">
                    {i + 1}. {t.name} <span className="font-normal text-mute">· {t.age}</span>
                  </span>
                  <span className="text-[13px] text-mute">{OCCUPANCY_LABEL[t.occupancy]}</span>
                </li>
              ))}
            </ol>
            <p className="text-[13px] text-ink2">
              Lead: <b className="text-ink">{b.leadName}</b> · {b.leadPhone} · {b.leadEmail}
            </p>
          </section>

          <section className={panel}>
            <h2 className={heading}>Price</h2>
            <div className="grid gap-1.5 text-sm">
              {b.quote.lines.map((l) => (
                <div key={`${l.kind}-${l.occupancy}`} className="flex justify-between gap-3">
                  <span className="text-ink2">
                    {lineLabel(l, b.quote.deal?.label)} · {l.count} × {l.unitPaise < 0 ? '−' : ''}
                    {inr(Math.abs(l.unitPaise))}
                  </span>
                  <span className="num">
                    {l.amountPaise < 0 ? '−' : ''}
                    {inr(Math.abs(l.amountPaise))}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-ink pt-2 font-bold">
                <span>Total</span>
                <span className="num">{inr(b.totalPaise)}</span>
              </div>
              <div className="flex justify-between text-ink2">
                <span>Paid</span>
                <span className="num">{inr(b.paidPaise)}</span>
              </div>
            </div>
          </section>

          <section className={panel}>
            <h2 className={heading}>Payment timeline</h2>
            <Timeline events={b.timeline} />
            {b.payments.length > 0 && (
              <ul className="grid gap-1 border-t border-line pt-3 text-[13px] text-ink2">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-x-3">
                    <span>
                      {PROVIDER[p.provider]} · {p.status}
                      {p.refundedPaise != null && p.refundedPaise !== p.amountPaise && (
                        <span> · {inr(p.refundedPaise)} back</span>
                      )}
                      {p.paymentId && <span className="num"> · {p.paymentId}</span>}
                      {p.reference && <span> · {p.reference}</span>}
                      {!p.paymentId && p.orderId && (
                        <span className="num text-mute"> · {p.orderId}</span>
                      )}
                    </span>
                    <span className="num">
                      {inr(p.amountPaise)}{' '}
                      <span className="text-mute">
                        {istTime(p.updatedAt)}, {istFullDate(p.updatedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-3.5">
          <section className={panel}>
            <h2 className={heading}>Status</h2>
            <div className="flex flex-wrap gap-1">
              <StateBadge status={b.status} holdLive={b.holdLive} cancelReason={b.cancelReason} />
              {b.refundNeeded && <RefundFlag />}
              {b.cancellation?.status === 'requested' && <CancelRequested />}
            </div>
            {b.status === 'pending' && (
              <p className="text-[13px] text-mute">
                {b.holdLive
                  ? `Seats held until ${istTime(b.holdExpiresAt)}.`
                  : 'The hold has lapsed — its seats are free for others.'}
              </p>
            )}
            <DeskActions booking={b} />
            {b.hasVoucher && (
              <a
                href={voucherHref(b.ref)}
                className={buttonVariants({ size: 'sm', variant: 'ghost' })}
              >
                <FileDown className="size-4" aria-hidden />
                Voucher PDF
              </a>
            )}
          </section>

          {b.cancellation && (
            <section className={panel}>
              <h2 className={heading}>Cancellation request</h2>
              <p className="text-sm break-words whitespace-pre-line">“{b.cancellation.reason}”</p>
              {b.cancellation.status === 'requested' ? (
                <>
                  <p className="text-[13px] text-mute">
                    Asked {istFullDate(b.cancellation.requestedAt)} — the seats stay held until you
                    decide.
                  </p>
                  <ResolveCancellation
                    bookingRef={b.ref}
                    cancellation={b.cancellation}
                    paidPaise={b.paidPaise}
                  />
                </>
              ) : (
                <Resolved c={b.cancellation} />
              )}
            </section>
          )}

          {b.review && (
            <section className={panel}>
              <h2 className={heading}>Review</h2>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Stars value={b.review.rating} className="text-[15px]" />
                <span className="font-bold text-mute">{REVIEW_STATE[b.review.state]}</span>
              </div>
              <p className="text-sm break-words whitespace-pre-line">“{b.review.text}”</p>
              <Link href={reviewsHref(b.review.state)} className="text-sm font-bold text-primary">
                {b.review.state === 'pending' ? 'Publish or hide it' : 'Open in Reviews'}
              </Link>
            </section>
          )}

          <section className={panel}>
            <h2 className={heading}>Trip</h2>
            <b className="text-sm">{b.package.name}</b>
            <span className="text-[13px] text-mute">
              {duration(b.package.nights, b.package.days)} · {b.package.departureCity} ·{' '}
              {formatDate(b.departs)} → {formatDate(b.returns)}
            </span>
            <Link
              href={`/packages/${b.package.slug}`}
              target="_blank"
              className="text-sm font-bold text-primary"
            >
              View the package page
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}

/** An answered request: the decision, the refund agreed and the note the customer got. */
function Resolved({ c }: { c: NonNullable<AdminBooking['cancellation']> }) {
  const approved = c.status === 'approved';
  return (
    <div className="grid gap-1.5 rounded-btn bg-bg2 p-3 text-[13px] text-ink2">
      <b className="text-sm text-ink">
        {approved ? 'Approved — booking cancelled' : 'Rejected — the booking stands'}
        {c.resolvedAt && (
          <span className="font-normal text-mute"> · {istFullDate(c.resolvedAt)}</span>
        )}
      </b>
      {approved && (
        <span>
          Refund agreed:{' '}
          <b className="num text-ink">{c.refundPaise ? inr(c.refundPaise) : 'none'}</b>
        </span>
      )}
      {c.refundNote && <p className="break-words whitespace-pre-line">{c.refundNote}</p>}
    </div>
  );
}
