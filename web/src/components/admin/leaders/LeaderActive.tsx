'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { AdminLeader } from '@/lib/admin/leader-schema';
import { ApiRequestError } from '@/lib/api-errors';

/** The card's on/off switch. Off is refused while they still lead something upcoming — the
 *  api names it, and the toast says so word for word. */
export function LeaderActive({ leader }: { leader: AdminLeader }) {
  const router = useRouter();
  const pathname = usePathname();
  const [on, setOn] = useState(leader.active);
  const [busy, setBusy] = useState(false);

  async function flip(next: boolean) {
    setBusy(true);
    setOn(next);
    try {
      await adminRequest(`/admin/leaders/${leader.id}/active`, {
        method: 'POST',
        body: { active: next },
      });
      toast.success(next ? `${leader.name} is on` : `${leader.name} is switched off`);
      router.refresh();
    } catch (e) {
      setOn(!next);
      if (e instanceof ApiRequestError && e.status === 409) toast.error(e.body.message);
      else reportAdminError(e, { router, pathname, fallback: 'Could not change — try again' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Switch
      checked={on}
      disabled={busy}
      onCheckedChange={flip}
      aria-label={`${leader.name} active`}
    />
  );
}
