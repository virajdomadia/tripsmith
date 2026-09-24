'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { STATUS_LABELS, statusChoices, type EnquiryStatus } from '@/lib/admin/enquiry-filters';

/**
 * Mockup A7's one-click status control. `router.refresh()` afterwards re-renders the server
 * components, which is also what moves the sidebar's new-enquiry badge: it rides along on
 * `GET /auth/session` (F16), so nothing here needs to know the badge exists. Only legal moves
 * (R24 `STATUS_MOVES`) are offered beside the current status; the api 409s anything else.
 */
export function StatusPicker({ id, status }: { id: string; status: EnquiryStatus }) {
  const router = useRouter();
  const pathname = usePathname();
  const [saving, setSaving] = useState<EnquiryStatus | null>(null);
  const [, startTransition] = useTransition();

  async function choose(next: EnquiryStatus) {
    if (next === status || saving) return;
    setSaving(next);
    try {
      await adminRequest(`/admin/enquiries/${id}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      toast.success(`Marked ${STATUS_LABELS[next].toLowerCase()}`);
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not change the status' });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Enquiry status">
      {statusChoices(status).map((s) => {
        const active = s === status;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            disabled={saving !== null}
            onClick={() => void choose(s)}
            className={`rounded-[10px] px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-60 ${
              active ? 'bg-ink text-white' : 'bg-bg2 text-ink2 hover:bg-line'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
