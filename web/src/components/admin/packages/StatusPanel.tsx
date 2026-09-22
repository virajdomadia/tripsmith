'use client';

import { Check, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { components } from '@/lib/api-types';

type AdminPackage = components['schemas']['AdminPackage'];

/**
 * Mockup A4's Status side card. The rules come from the api already evaluated
 * (`publishRules` on every `AdminPackage`) — the browser never re-derives them, so there is
 * exactly one definition of "ready to publish" and the panel cannot drift from the endpoint
 * that enforces it.
 */
export function StatusPanel({ pkg }: { pkg: AdminPackage }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const live = pkg.status === 'live';

  async function setStatus(status: 'live' | 'draft') {
    setBusy(true);
    try {
      await adminRequest(`/admin/packages/${pkg.id}/status`, { method: 'POST', body: { status } });
      toast.success(
        status === 'live'
          ? 'Published — the public pages refresh in a few seconds'
          : 'Unpublished — the package is a draft again',
      );
      router.refresh();
    } catch (e) {
      reportAdminError(e, {
        router,
        pathname,
        fallback: 'Could not change the status — try again',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <Badge variant={live ? 'default' : 'secondary'}>{live ? 'Live' : 'Draft'}</Badge>
        {live ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={() => setStatus('draft')}
          >
            {busy ? 'Working…' : 'Unpublish'}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={busy || !pkg.canPublish}
            onClick={() => setStatus('live')}
          >
            {busy ? 'Publishing…' : 'Publish'}
          </Button>
        )}
      </div>

      <ul className="grid gap-2">
        {pkg.publishRules.map((r) => (
          <li
            key={r.key}
            aria-label={`${r.label}: ${r.ok ? 'done' : 'not done'}`}
            className="flex items-start gap-2"
          >
            {r.ok ? (
              <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            ) : (
              <X className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden />
            )}
            <span className="grid gap-0.5">
              <span className="text-[13px] font-semibold">{r.label}</span>
              <span className="text-[13px] text-mute">{r.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[13px] text-mute">
        Publishing revalidates the public page, the listing, the destination page and the itinerary
        PDF.
      </p>
    </div>
  );
}
