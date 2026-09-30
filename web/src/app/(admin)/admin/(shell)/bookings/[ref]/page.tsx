import { ArrowLeft, FileDown, Mail, MessageCircle, Phone } from 'lucide-react';
import { Documents } from '@/components/site/account/Documents';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { History } from '@/components/admin/bookings/History';
import { BalanceActions } from '@/components/admin/bookings/BalanceActions';
import { Lifecycle } from '@/components/admin/bookings/Lifecycle';
import { RemoveAddon } from '@/components/admin/bookings/RemoveAddon';
import { BookedAddons } from '@/components/site/booking/BookedAddons';
import { SeatStrip } from '@/components/admin/bookings/SeatStrip';
import { CancelRequested, RefundFlag, StateBadge } from '@/components/admin/bookings/StateBadge';
import { Stars } from '@/components/site/Stars';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { mailtoHref, telHref, waHref } from '@/lib/admin/enquiry-links';
import { buttonVariants } from '@/components/ui/button';
import { travellersLabel, voucherHref } from '@/lib/account';
import { DESK_PATH } from '@/lib/admin/booking-filters';
import { REFUND_REASON, REFUND_STATUS } from '@/lib/admin/refunds';
import { reviewsHref } from '@/lib/admin/reviews';
import { api, ApiRequestError } from '@/lib/api';
import { formatDate, inr } from '@/lib/format';

export const metadata = { title: 'Booking' };

const REF = /^TB-[A-Z0-9]{6}$/;
const PROVIDER = { razorpay: 'Razorpay', offline: 'Offline' } as const;
const REVIEW_STATE = { pending: 'Waiting', published: 'Published', hidden: 'Hidden' } as const;

/**
 * One booking, laid out as mockup Booking detail C · Lifecycle (R59, P20): the stepper, only the
 * valid next moves, and the step it stands at — then its full history (R54), payments, seats and
 * review. Every move is the desk's existing endpoint; the api re-checks each one.
 */
const REFUND_TONE: Record<string, string> = {
  requested: 'text-warn',
  processed: 'text-ok',
  failed: 'text-bad',
};

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
  const outline = buttonVariants({ size: 'sm', variant: 'outline' });
  return (
    <>
      <PageHead
        title={`${b.ref} · ${b.leadName}`}
        subtitle={`${b.package.name} · ${formatDate(b.departs)} · ${travellersLabel(b.travellers.length)} · ${inr(b.totalPaise)} · booked ${istFullDate(b.bookedAt)}`}
        actions={
          <>
            <a href={telHref(b.leadPhone)} className={outline}>
              <Phone className="size-4" aria-hidden />
              Call
            </a>
            <a
              href={waHref(b.leadPhone, hello)}
              target="_blank"
              rel="noreferrer"
              className={outline}
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
            <a
              href={mailtoHref(b.leadEmail, `Your Tripsmith booking ${b.ref}`)}
              className={outline}
            >
              <Mail className="size-4" aria-hidden />
              Email
            </a>
            {b.hasVoucher && (
              <a href={voucherHref(b.ref)} className={outline}>
                <FileDown className="size-4" aria-hidden />
                Voucher
              </a>
            )}
            <Link href={DESK_PATH} className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
              <ArrowLeft className="size-4" aria-hidden />
              Desk
            </Link>
          </>
        }
      />
      <div className="-mt-2 flex flex-wrap gap-1">
        <StateBadge status={b.status} holdLive={b.holdLive} cancelReason={b.cancelReason} />
        {b.refundNeeded && <RefundFlag />}
        {b.cancellation?.status === 'requested' && <CancelRequested />}
      </div>

      {/* Keyed on the state, so the stepper re-opens on the new "now" after a move. */}
      <Lifecycle
        key={`${b.status}-${b.cancelReason}-${b.refundNeeded}-${b.cancellation?.status}`}
        b={b}
      />

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className={panel} aria-labelledby="history">
          <h2 id="history" className={heading}>
            History <span className="font-semibold text-mute">· changes, payments, emails</span>
          </h2>
          {/* Undefined while an older api answers (web and api deploy separately). */}
          <History history={b.history ?? { entries: [], rebuiltOn: null }} />
        </section>

        <div className="grid gap-3.5">
          <SeatStrip seats={b.departure} />

          <section className={panel}>
            <h2 className={heading}>Lead</h2>
            <p className="text-[13px] break-words text-ink2">
              <b className="text-ink">{b.leadName}</b> · {b.leadPhone} · {b.leadEmail}
            </p>
            <p className="text-[13px] text-mute">
              {b.package.departureCity} · {formatDate(b.departs)} → {formatDate(b.returns)}
            </p>
            <Link
              href={`/packages/${b.package.slug}`}
              target="_blank"
              className="text-sm font-bold text-primary"
            >
              View the package page
            </Link>
          </section>

          {b.balance && (
            // P5: made on a deposit — the balance, and settling or extending it.
            <section className={panel} aria-labelledby="balance">
              <h2 id="balance" className={heading}>
                Deposit &amp; balance
              </h2>
              <BalanceActions booking={b} />
            </section>
          )}

          {(b.addons ?? []).length > 0 && (
            <section className={panel} aria-labelledby="addons">
              <h2 id="addons" className={heading}>
                Add-ons
              </h2>
              <div className="grid gap-1.5 text-[13px]">
                <BookedAddons
                  quote={b.quote}
                  addons={b.addons}
                  action={
                    b.canRemoveAddons
                      ? (a) => <RemoveAddon bookingRef={b.ref} addon={a} />
                      : undefined
                  }
                />
              </div>
            </section>
          )}

          {b.payments.length > 0 && (
            <section className={panel}>
              <h2 className={heading}>Payments</h2>
              <ul className="grid gap-1.5 text-[13px] text-ink2">
                {b.payments.map((p) => (
                  <li key={p.id} className="grid gap-px">
                    <span className="flex justify-between gap-2">
                      <span>
                        {PROVIDER[p.provider]} · {p.status}
                        {p.refundedPaise != null && <span> · {inr(p.refundedPaise)} back</span>}
                      </span>
                      <b className="num text-ink">{inr(p.amountPaise)}</b>
                    </span>
                    <span className="num text-[12px] break-all text-mute">
                      {p.paymentId ?? p.reference ?? p.orderId} · {istTime(p.updatedAt)},{' '}
                      {istFullDate(p.updatedAt)}
                    </span>
                    {b.refunds
                      .filter((r) => r.paymentId === p.id)
                      .map((r) => (
                        <span
                          key={r.id}
                          className="grid gap-px border-l-2 border-line pl-2 text-[12.5px]"
                        >
                          <span className="flex justify-between gap-2">
                            <span>
                              ↩ Refund · {REFUND_REASON[r.reason] ?? r.reason} ·{' '}
                              <b className={REFUND_TONE[r.status]}>
                                {r.byHand && r.status === 'requested'
                                  ? 'to hand back'
                                  : REFUND_STATUS[r.status]}
                              </b>
                            </span>
                            <span className="num">−{inr(r.amountPaise)}</span>
                          </span>
                          <span className="text-mute">
                            <span className="num break-all">
                              {r.razorpayRefundId ??
                                (r.byHand
                                  ? 'by hand'
                                  : r.status === 'failed'
                                    ? 'refused by Razorpay'
                                    : 'not yet at Razorpay')}
                            </span>
                            {r.error ? ` · ${r.error}` : ''} · {istTime(r.createdAt)},{' '}
                            {istFullDate(r.createdAt)}
                          </span>
                        </span>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {b.documents.length > 0 && (
            <section className={panel}>
              <h2 className={heading}>GST documents</h2>
              <Documents bookingRef={b.ref} documents={b.documents} />
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
        </div>
      </div>
    </>
  );
}
