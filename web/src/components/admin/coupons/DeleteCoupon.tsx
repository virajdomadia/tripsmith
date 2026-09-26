'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';

/** Delete only while unused (a typo, say); once used a coupon can only be paused (B15). */
export function DeleteCoupon({ id, code, locked }: { id: string; code: string; locked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await adminRequest(`/admin/coupons/${id}`, { method: 'DELETE' });
      toast.success(`${code} deleted`);
      router.push('/admin/coupons');
      router.refresh();
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not delete — try again' });
      setBusy(false);
      setOpen(false);
    }
  }

  if (locked)
    return (
      <small className="text-mute">In use, so it can’t be deleted — switch it off instead.</small>
    );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          Delete coupon
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {code}?</DialogTitle>
          <DialogDescription>Nobody has used it yet. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
