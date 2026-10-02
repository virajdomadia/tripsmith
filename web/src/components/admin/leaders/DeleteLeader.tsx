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

type Props = { id: string; name: string; deletable: boolean };

/** Only a leader who never led or was set to lead anything can go; anyone else is switched off,
 *  so past trips and reviews keep saying who led them. */
export function DeleteLeader({ id, name, deletable }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await adminRequest(`/admin/leaders/${id}`, { method: 'DELETE' });
      toast.success(`${name} deleted`);
      router.push('/admin/leaders');
      router.refresh();
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not delete — try again' });
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" size="sm" disabled={!deletable}>
            Delete leader
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              They have never been picked for a trip, so nothing else changes. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep them
            </Button>
            <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <small className="text-mute">
        {deletable
          ? 'Never picked for a trip.'
          : 'They have led or are set to lead trips — switch them off instead, so past trips keep their leader.'}
      </small>
    </div>
  );
}
