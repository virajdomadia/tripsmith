'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';

/** Pause / resume from the list: a paused code reads as unknown to customers. */
export function ActiveToggle({ id, code, active }: { id: string; code: string; active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={`${code} on`}
      onCheckedChange={(on) =>
        start(async () => {
          try {
            await adminRequest(`/admin/coupons/${encodeURIComponent(id)}/active`, {
              method: 'POST',
              body: { active: on },
            });
            toast.success(on ? `${code} is on again` : `${code} paused`);
            router.refresh();
          } catch (e) {
            reportAdminError(e, { router, pathname, fallback: 'Could not update the coupon' });
          }
        })
      }
    />
  );
}
