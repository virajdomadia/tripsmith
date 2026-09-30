'use client';

import { Check, Clock, Copy, Lock, Mail, MessageCircle, RefreshCw, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
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
import { travellersLabel } from '@/lib/account';
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { adminRequest } from '@/lib/admin/client';
import { countdown, linkMessage, waNumber } from '@/lib/admin/counter';
import { reportAdminError } from '@/lib/admin/errors';
import { formatDate, inr } from '@/lib/format';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "14:12 · Thu 1 Oct 2026" — when the link and the seats end. */
export const heldUntil = (iso: string) => `${istTime(iso)} · ${istFullDate(iso)}`;

/**
 * R56 (P18b): the counter's Razorpay Payment Link on a booking — the link to copy, WhatsApp or
 * email; a live countdown to when it and the seats end; Check payment (asks Razorpay, applies it
 * through the one capture path) and Cancel link (cancels at Razorpay, then frees the seats).
 * `onChanged` takes the booking the api answers with; without it the page refreshes.
 */
export function LinkPanel({
  booking: b,
  onChanged,
}: {
  booking: AdminBooking;
  onChanged?: (b: AdminBooking) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const link = b.paymentLink;
  const [busy, setBusy] = useState<string | null>(null);
  // The clock starts after hydration: the server's render and the browser's first one match.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (link?.status !== 'open') return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [link?.status]);
  if (!link) return null;

  const left = now === null ? null : new Date(link.expiresAt).getTime() - now;
  const first = b.leadName.split(' ')[0] ?? b.leadName;
  const deposit = link.amountPaise < b.totalPaise;
  const message = link.url
    ? linkMessage({
        firstName: first,
        packageName: b.package.name,
        when: formatDate(b.departs),
        party: travellersLabel(b.travellers.length),
        amount: inr(link.amountPaise),
        deposit,
        held: heldUntil(link.expiresAt),
        url: link.url,
      })
    : '';

  async function act(what: 'check' | 'cancel' | 'email', done: string) {
    setBusy(what);
    try {
      const next = await adminRequest<AdminBooking>(`/admin/bookings/${b.ref}/link/${what}`, {
        method: 'POST',
      });
      if (what !== 'check') toast.success(done);
      else if (next.status === 'confirmed' || next.status === 'partially_paid')
        toast.success('Paid — booking confirmed');
      else if (next.status === 'cancelled' && next.refundNeeded)
        toast.warning('Paid after the seats had gone — the payment is being refunded');
      else toast.info('Not paid yet');
      if (onChanged) onChanged(next);
      else router.refresh();
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not reach Razorpay — try again' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — select the link and copy it');
    }
  }

  if (link.status !== 'open')
    return (
      <div className="grid gap-2 rounded-[14px] border border-line p-3.5 text-[13.5px]">
        <p className="flex items-center gap-1.5">
          {link.status === 'paid' ? (
            <Check className="size-4 text-ok" aria-hidden />
          ) : (
            <Clock className="size-4 text-mute" aria-hidden />
          )}
          <b>
            {link.status === 'paid'
              ? `Paid through the payment link · ${inr(link.amountPaise)}`
              : link.status === 'cancelled'
                ? 'Payment link cancelled — seats released'
                : `Payment link expired ${heldUntil(link.expiresAt)} — seats released`}
          </b>
        </p>
        {link.canCheck && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={!!busy}
            onClick={() => act('check', '')}
          >
            <RefreshCw className={cn('size-4', busy === 'check' && 'animate-spin')} aria-hidden />
            Check payment
          </Button>
        )}
      </div>
    );

  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap gap-1.5 text-[12px] font-bold">
        <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-0.5 text-warn">
          <Clock className="size-3.5" aria-hidden />
          Awaiting payment
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-primary">
          <Lock className="size-3.5" aria-hidden />
          {b.travellers.length} seat{b.travellers.length === 1 ? '' : 's'} held
        </span>
        <span className="rounded-full bg-bg2 px-2.5 py-0.5 text-ink2">{b.ref}</span>
      </div>
      <div className="flex items-center gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-primary bg-primary-soft px-3 py-2.5 text-primary-ink">
        <code className="min-w-0 flex-1 font-mono text-[14px] font-bold [overflow-wrap:anywhere]">
          {link.url}
        </code>
        <Button type="button" size="sm" variant="ghost" onClick={copy} aria-label="Copy link">
          <Copy className="size-4" aria-hidden />
          Copy
        </Button>
      </div>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="text-[13px] font-bold text-mute">Link expires in</span>
          <b className="num text-[26px] tracking-tight" aria-live="off">
            {left === null ? '--:--:--' : countdown(left)}
          </b>
          <small className="text-[12.5px] text-mute">{heldUntil(link.expiresAt)}</small>
        </div>
        <span aria-hidden className="h-2 overflow-hidden rounded-full bg-bg2">
          <i
            className="block h-full rounded-full bg-warn"
            style={{
              width: `${left === null ? 100 : Math.max(0, Math.min(100, (left / DAY_MS) * 100)).toFixed(2)}%`,
            }}
          />
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" aria-hidden />
          Copy link
        </Button>
        <a
          href={`https://wa.me/${waNumber(b.leadPhone)}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-wa px-3 text-sm font-medium text-white no-underline hover:bg-[#106a31]"
        >
          <MessageCircle className="size-4" aria-hidden />
          WhatsApp {b.leadPhone.slice(0, 5)} {b.leadPhone.slice(5)}
        </a>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => act('email', `Emailed to ${b.leadEmail}`)}
        >
          <Mail className="size-4" aria-hidden />
          {busy === 'email' ? 'Sending…' : 'Email'}
        </Button>
      </div>
      <p className="text-[12.5px] text-mute">
        {inr(link.amountPaise)}
        {deposit ? ' deposit' : ' in full'}. If the link lapses, the seats are released and the
        history logs it. A payment after that still confirms if the seats are free.
      </p>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => act('check', '')}
        >
          <RefreshCw className={cn('size-4', busy === 'check' && 'animate-spin')} aria-hidden />
          Check payment
        </Button>
        <CancelLink
          busy={busy === 'cancel'}
          onConfirm={() => act('cancel', 'Link cancelled — seats released')}
        />
      </div>
    </div>
  );
}

function CancelLink({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="text-bad hover:text-bad">
          <X className="size-4" aria-hidden />
          Cancel link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel the payment link?</DialogTitle>
          <DialogDescription>
            Razorpay stops the link first; then the booking is cancelled and its seats freed. If the
            customer has just paid, the booking is confirmed instead.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {busy ? 'Cancelling…' : 'Cancel link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
