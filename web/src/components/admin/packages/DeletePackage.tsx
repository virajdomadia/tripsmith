'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';

type Props = { id: string; name: string; enquiryCount: number };

/** Danger zone: blocked (and explained) while enquiries reference the package (06 §C4). */
export function DeletePackage({ id, name, enquiryCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocked = enquiryCount > 0;

  async function confirm() {
    setBusy(true);
    try {
      await adminRequest(`/admin/packages/${id}`, { method: 'DELETE' });
      toast.success(`${name} deleted`);
      router.push('/admin/packages');
      router.refresh();
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not delete — try again' });
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="grid gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" size="sm" disabled={blocked}>
            Delete package
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the package, its itinerary, departures and photos. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <small className="text-mute">
        {blocked
          ? `Delete is blocked while ${enquiryCount} ${enquiryCount === 1 ? 'enquiry references' : 'enquiries reference'} this package.`
          : 'No enquiries reference this package.'}
      </small>
    </div>
  );
}
