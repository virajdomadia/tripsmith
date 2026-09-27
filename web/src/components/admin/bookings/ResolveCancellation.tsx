'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SplitList } from '@/components/admin/bookings/DeskActions';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { splitNewestFirst } from '@/lib/admin/refunds';
import { ApiRequestError } from '@/lib/api-errors';
import { inr } from '@/lib/format';

// api schemas/admin_bookings.py RESOLVE_NOTE_MIN / RESOLVE_NOTE_MAX
const NOTE_MIN = 5;
const NOTE_MAX = 500;

type Cancellation = NonNullable<AdminBooking['cancellation']>;
type Decision = 'approve' | 'reject';

/**
 * The owner's answer to a cancellation request (R19, B11), on the booking page. Approve takes the
 * refund — pre-filled from the policy tier on the day the customer asked, applied to what was
 * paid — and a note; reject takes a note. The note reaches the customer in the email and on their
 * booking page, so it is required either way. The api re-checks everything under the booking's
 * lock; a 409 (already answered, trip no longer active) lands as a toast.
 */
export function ResolveCancellation({
  bookingRef,
  cancellation: c,
  paidPaise,
}: {
  bookingRef: string;
  cancellation: Cancellation;
  paidPaise: number;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-[13px] text-ink2">
        Asked {c.daysOut === 1 ? '1 day' : `${c.daysOut} days`} before departure — the policy says:{' '}
        <b className="text-ink">{c.tier}</b>.
      </p>
      <div className="flex flex-wrap gap-2">
        {c.canApprove && (
          <ResolveDialog bookingRef={bookingRef} c={c} decision="approve" paidPaise={paidPaise} />
        )}
        <ResolveDialog bookingRef={bookingRef} c={c} decision="reject" paidPaise={paidPaise} />
      </div>
      {!c.canApprove && (
        <p className="text-[13px] text-mute">
          This booking no longer holds its seats, so the request can only be rejected.
        </p>
      )}
    </div>
  );
}

export function ResolveDialog({
  bookingRef,
  c,
  decision,
  paidPaise,
  totalPaise = paidPaise,
  payments = [],
}: {
  bookingRef: string;
  c: Cancellation;
  decision: Decision;
  paidPaise: number;
  /** P13: with the payments, the approve confirm previews the refund's newest-first split. */
  totalPaise?: number;
  payments?: AdminBooking['payments'];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const approve = decision === 'approve';
  // Whole rupees, rounded down: a pre-filled refund must never exceed what was paid.
  const suggested = String(Math.floor(c.suggestedRefundPaise / 100));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [rupees, setRupees] = useState(suggested);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // P13: approving with a refund shows a confirm step first — money leaves only on Confirm.
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();
  const length = [...note.trim()].length;
  // What the api will send: the refund agreed plus, in full, anything paid beyond the price.
  const surplus = Math.max(0, paidPaise - totalPaise);
  const refundTotal = Number(rupees) * 100 + surplus;

  function check(): Record<string, string> {
    const found: Record<string, string> = {};
    if (length < NOTE_MIN) found.note = 'Write the customer a line — it goes in the email.';
    if (approve) {
      const n = Number(rupees);
      if (rupees.trim() === '' || !Number.isInteger(n) || n < 0)
        found.refundPaise = 'Whole rupees, ₹0 if nothing is refunded';
      else if (n * 100 > paidPaise) found.refundPaise = `At most ${inr(paidPaise)} — what was paid`;
    }
    return found;
  }

  async function submit() {
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (approve && refundTotal > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await adminRequest(`/admin/cancellations/${c.id}/resolve`, {
        method: 'POST',
        body: {
          decision,
          note: note.trim(),
          ...(approve ? { refundPaise: Number(rupees) * 100 } : {}),
        },
      });
      toast.success(
        approve
          ? refundTotal > 0
            ? `${bookingRef} cancelled — ${inr(refundTotal)} refund sent, the customer is emailed`
            : `${bookingRef} cancelled — the customer is emailed`
          : 'Request rejected — the customer is emailed',
      );
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) {
        setErrors(e.body.fieldErrors);
        setConfirming(false);
      } else {
        reportAdminError(e, { router, pathname, fallback: 'Could not save — try again' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setErrors({});
          setRupees(suggested);
          setConfirming(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={approve ? 'default' : 'outline'}>
          {approve ? 'Approve cancellation' : 'Reject'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {confirming ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Refund {inr(refundTotal)} and cancel {bookingRef}?
              </DialogTitle>
              <DialogDescription asChild>
                <div>
                  The refund goes back through Razorpay to the way they paid, newest payment first:
                  <SplitList parts={splitNewestFirst(payments, refundTotal)} />
                  {surplus > 0 && (
                    <span className="mb-2 block">
                      That is the {inr(Number(rupees) * 100)} you agreed plus {inr(surplus)} paid
                      beyond the price, which always goes back in full.
                    </span>
                  )}
                  Money leaves as soon as you confirm, once — banks take 5–7 working days. The seats
                  go back on sale and the customer is emailed.
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Change amount
              </Button>
              <Button type="button" autoFocus onClick={() => void submit()} disabled={busy}>
                {busy ? 'Refunding…' : `Confirm — refund ${inr(refundTotal)}`}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {approve ? `Cancel ${bookingRef}?` : `Reject the request on ${bookingRef}?`}
              </DialogTitle>
              <DialogDescription>
                {approve
                  ? 'The booking is cancelled and its seats go back on sale at once. The refund goes back through Razorpay — you confirm the amount on the next step.'
                  : 'The booking stays confirmed and keeps its seats. The customer can’t ask again.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {approve && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-refund`}>Refund (₹)</Label>
                  <Input
                    id={`${id}-refund`}
                    autoFocus
                    inputMode="numeric"
                    value={rupees}
                    onChange={(e) => setRupees(e.target.value.replace(/[^0-9]/g, ''))}
                    aria-invalid={errors.refundPaise ? true : undefined}
                    aria-describedby={`${id}-refund-hint`}
                    className="num"
                  />
                  <p
                    id={`${id}-refund-hint`}
                    className={`text-xs ${errors.refundPaise ? 'font-semibold text-bad' : 'text-mute'}`}
                    role={errors.refundPaise ? 'alert' : undefined}
                  >
                    {errors.refundPaise ??
                      `Paid ${inr(paidPaise)} · the tier suggests ${inr(c.suggestedRefundPaise)}. Take off any non-refundable tickets.`}
                  </p>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-note`}>
                  {approve ? 'Note to the customer' : 'Why — to the customer'}
                </Label>
                <Textarea
                  id={`${id}-note`}
                  rows={4}
                  maxLength={NOTE_MAX}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-invalid={errors.note ? true : undefined}
                  aria-describedby={`${id}-note-hint`}
                  placeholder={
                    approve
                      ? 'The refund goes back to your card within 5–7 working days.'
                      : 'The hotel is already paid for these dates — we can move you to a later one.'
                  }
                />
                <p id={`${id}-note-hint`} className="flex justify-between gap-3 text-xs text-mute">
                  <span
                    className={errors.note ? 'font-semibold text-bad' : ''}
                    role={errors.note ? 'alert' : undefined}
                  >
                    {errors.note ?? 'Shown in the email and on their booking page.'}
                  </span>
                  <span className="num shrink-0">
                    {length}/{NOTE_MAX}
                  </span>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                type="button"
                variant={approve ? 'default' : 'destructive'}
                onClick={() => void submit()}
                disabled={busy}
              >
                {busy
                  ? 'Saving…'
                  : approve
                    ? refundTotal > 0
                      ? 'Review the refund'
                      : 'Cancel booking and email'
                    : 'Reject and email'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
