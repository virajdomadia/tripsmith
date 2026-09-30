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
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { ApiRequestError } from '@/lib/api-errors';
import { OCCUPANCY_LABEL } from '@/lib/booking';

type Row = { name: string; age: string };

/**
 * P18: names and ages for a booking's travellers, in its order — the details a counter booking
 * left for later. The rooms stay as booked; a child's age stays inside the child rate (the api
 * re-checks and says which row). Logged in the booking's history.
 */
export function EditTravellers({ booking: b }: { booking: AdminBooking }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function reset(next: boolean) {
    if (next) {
      setRows(b.travellers.map((t) => ({ name: t.name, age: t.age == null ? '' : String(t.age) })));
      setErrors({});
    }
    setOpen(next);
  }

  async function save() {
    setBusy(true);
    try {
      await adminRequest(`/admin/bookings/${b.ref}/travellers`, {
        method: 'PUT',
        body: {
          travellers: rows.map((r) => ({
            name: r.name.trim(),
            age: r.age.trim() ? Number(r.age) : null,
          })),
        },
      });
      toast.success('Traveller details saved');
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) setErrors(e.body.fieldErrors);
      else reportAdminError(e, { router, pathname, fallback: 'Could not save — try again' });
    } finally {
      setBusy(false);
    }
  }

  const invalid = rows.some((r) => r.name.trim().length < 2);
  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Edit travellers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Travellers on {b.ref}</DialogTitle>
          <DialogDescription>
            Names as on ID. Adults’ ages are optional; a child’s age must stay 5–11. Rooms stay as
            booked.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-2.5">
          {rows.map((r, i) => {
            const t = b.travellers[i]!;
            const err = errors[`travellers.${i}.age`] ?? errors[`travellers.${i}.name`];
            return (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_76px] gap-2">
                <span className="col-span-2 text-[12px] font-bold text-mute">
                  {i + 1}. {OCCUPANCY_LABEL[t.occupancy]}
                </span>
                <Input
                  aria-label={`Traveller ${i + 1} name`}
                  value={r.name}
                  maxLength={80}
                  onChange={(e) =>
                    setRows(rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                <Input
                  aria-label={`Traveller ${i + 1} age`}
                  className="num"
                  inputMode="numeric"
                  placeholder="Age"
                  value={r.age}
                  aria-invalid={!!errors[`travellers.${i}.age`]}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, k) =>
                        k === i ? { ...x, age: e.target.value.replace(/\D/g, '').slice(0, 3) } : x,
                      ),
                    )
                  }
                />
                {err && <span className="col-span-2 text-[12px] font-bold text-warn">{err}</span>}
              </li>
            );
          })}
        </ol>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || invalid} onClick={save}>
            {busy ? 'Saving…' : 'Save travellers'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
