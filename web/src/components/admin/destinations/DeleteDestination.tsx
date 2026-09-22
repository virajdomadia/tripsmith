'use client';

import { useRouter } from 'next/navigation';
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
import { ApiRequestError } from '@/lib/api-errors';

type Props = { id: string; name: string; packageCount: number };

/** Danger zone: blocked (and explained) while packages reference the destination. */
export function DeleteDestination({ id, name, packageCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocked = packageCount > 0;

  async function confirm() {
    setBusy(true);
    try {
      await adminRequest(`/admin/destinations/${id}`, { method: 'DELETE' });
      toast.success(`${name} deleted`);
      router.push('/admin/destinations');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.body.message : 'Could not delete — try again');
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" size="sm" disabled={blocked}>
            Delete destination
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This removes the destination and its public page. It cannot be undone.
            </DialogDescription>
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
      <small className="text-mute">
        {blocked
          ? `Delete is blocked while ${packageCount} ${packageCount === 1 ? 'package uses' : 'packages use'} this destination.`
          : 'No packages use this destination.'}
      </small>
    </div>
  );
}
