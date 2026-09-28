'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { components } from '@/lib/api-types';
import { addonDetail } from '@/lib/booking';
import { inr } from '@/lib/format';

type BookedAddon = components['schemas']['BookedAddon'];
const NOTE_MAX = 200; // api schemas/extras.py RemoveAddonInput

/**
 * P8b: take one add-on off a confirmed booking. It is refunded in full through the one refund
 * function (Razorpay, or by hand for an offline payment), a credit note is issued, and the
 * customer sees it in their booking's activity. The booking keeps the line, struck through.
 */
export function RemoveAddon({ bookingRef, addon }: { bookingRef: string; addon: BookedAddon }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      try {
        await adminRequest(
          `/admin/bookings/${encodeURIComponent(bookingRef)}/addons/${encodeURIComponent(addon.id)}/remove`,
          { method: 'POST', body: { note: note.trim() || null } },
        );
        toast.success(`${addon.name} taken off — ${inr(addon.amountPaise)} refunding`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        reportAdminError(e, { router, pathname, fallback: 'Could not take it off — try again' });
      }
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12.5px]"
          aria-label={`Remove ${addon.name}`}
        >
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Take off {addon.name} — refund {inr(addon.amountPaise)}
          </DialogTitle>
          <DialogDescription>
            {addon.name} ({addonDetail(addon)}) comes off {bookingRef}. Its {inr(addon.amountPaise)}{' '}
            is refunded in full the way it was paid, with a credit note. The customer sees it in
            their booking.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`note-${addon.id}`}>Note to the customer (optional)</Label>
          <Input
            id={`note-${addon.id}`}
            value={note}
            maxLength={NOTE_MAX}
            placeholder="The houseboat operator cancelled that night"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button type="button" onClick={run} disabled={pending} aria-busy={pending}>
            {pending ? 'Taking off…' : 'Take off and refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
