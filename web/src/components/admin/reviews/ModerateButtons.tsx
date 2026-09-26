'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { ReviewState } from '@/lib/admin/reviews';

/**
 * Publish / Hide (R24). No confirm dialog: either move is undone from the other tab. The api
 * recomputes the package's rating and revalidates its pages; `router.refresh()` moves the row
 * to its new tab and updates the sidebar badge.
 */
export function ModerateButtons({ id, state }: { id: string; state: ReviewState }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  function act(move: 'publish' | 'hide') {
    start(async () => {
      try {
        await adminRequest(`/admin/reviews/${encodeURIComponent(id)}/${move}`, { method: 'POST' });
        toast.success(move === 'publish' ? 'Published on the trip’s page' : 'Hidden from the page');
        router.refresh();
      } catch (e) {
        reportAdminError(e, { router, pathname, fallback: 'Could not update the review' });
      }
    });
  }

  return (
    <div className="flex gap-2 sm:flex-col">
      {state !== 'published' && (
        <Button size="sm" disabled={pending} onClick={() => act('publish')}>
          Publish
        </Button>
      )}
      {state !== 'hidden' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act('hide')}>
          Hide
        </Button>
      )}
    </div>
  );
}
