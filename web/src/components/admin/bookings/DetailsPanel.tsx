'use client';

import { Check, Mail } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TravellerDetails, type SaveDetails } from '@/components/site/account/TravellerDetails';
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { ApiRequestError } from '@/lib/api-errors';

/**
 * R49 (P9b) on booking detail C: readiness, the trip's checklist as the customer ticked it,
 * "Send details link" while their form is open and someone's card is short, and the cards
 * themselves — ID masked — which the owner can fill in or correct past the customer's lock.
 */
export function DetailsPanel({ booking: b }: { booking: AdminBooking }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();
  const block = b.details;
  if (!block) return null;
  if (block.purged)
    return (
      <p className="text-[13px] text-mute">
        Deleted 30 days after the trip, as the privacy rule says (R49).
      </p>
    );

  const save: SaveDetails = async (travellerId, body) => {
    try {
      await adminRequest(`/admin/bookings/${b.ref}/travellers/${travellerId}/details`, {
        method: 'PUT',
        body,
      });
      toast.success('Traveller details saved');
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiRequestError)
        return {
          ok: false,
          error: { message: e.body.message, fieldErrors: e.body.fieldErrors ?? undefined },
        };
      return { ok: false, error: { message: 'Could not save — try again' } };
    }
  };

  async function sendLink() {
    setSending(true);
    try {
      await adminRequest(`/admin/bookings/${b.ref}/details-link`, { method: 'POST' });
      toast.success(`Details link sent to ${b.leadEmail}`);
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not send — try again' });
    } finally {
      setSending(false);
    }
  }

  const left = block.travellers.length - block.complete;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {b.readiness && (
          <p className="num text-[13px] text-ink2">
            <b className="text-[18px] text-ink">{b.readiness.percent}%</b> ready
          </p>
        )}
        <p className={`text-[13px] font-bold ${left ? 'text-warn' : 'text-ok'}`}>
          {left
            ? `${left} of ${block.travellers.length} travellers missing details`
            : 'All details in'}
        </p>
        {b.canSendDetailsLink && (
          <Button type="button" size="sm" variant="outline" onClick={sendLink} disabled={sending}>
            <Mail className="size-4" aria-hidden />
            {sending ? 'Sending…' : 'Send details link'}
          </Button>
        )}
      </div>
      {(b.checklist ?? []).length > 0 && (
        <ul className="grid gap-1 text-[13px]" aria-label="Pre-trip checklist">
          {(b.checklist ?? []).map((i) => (
            <li key={i.key} className="flex items-center gap-2">
              <span
                className={`grid size-4 place-items-center rounded-[5px] border ${i.done ? 'border-ok bg-ok text-white' : 'border-line'}`}
                aria-hidden
              >
                {i.done && <Check className="size-3" />}
              </span>
              <span className={i.done ? 'text-ink2' : ''}>{i.label}</span>
              <span className="sr-only">{i.done ? 'ticked' : 'not ticked'}</span>
            </li>
          ))}
        </ul>
      )}
      <TravellerDetails
        bookingRef={b.ref}
        block={block}
        owner={{ save, canEdit: b.canEditDetails }}
      />
    </div>
  );
}
