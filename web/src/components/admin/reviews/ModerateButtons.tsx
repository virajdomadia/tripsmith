'use client';

import { Check, EyeOff } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { ReviewState } from '@/lib/admin/reviews';

/**
 * Publish / Hide (R24). No confirm dialog: either move is undone from the other tab. The api
 * recomputes the package's rating and revalidates its pages; `router.refresh()` moves the review
 * to its new tab, opens the next one in the pane and updates the sidebar badge.
 */
export function ModerateButtons({
  id,
  state,
  name,
}: {
  id: string;
  state: ReviewState;
  name: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  function act(move: 'publish' | 'hide') {
    start(async () => {
      try {
        await adminRequest(`/admin/reviews/${encodeURIComponent(id)}/${move}`, { method: 'POST' });
        toast.success(
          move === 'publish'
            ? `Published on the trip’s page — ${name}’s review moved to Published`
            : `Hidden from the page — ${name}’s review moved to Hidden`,
        );
        router.refresh();
      } catch (e) {
        reportAdminError(e, { router, pathname, fallback: 'Could not update the review' });
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {state !== 'published' && (
        <Button size="sm" disabled={pending} onClick={() => act('publish')}>
          <Check className="size-4" aria-hidden />
          Publish
        </Button>
      )}
      {state !== 'hidden' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act('hide')}>
          <EyeOff className="size-4" aria-hidden />
          Hide
        </Button>
      )}
    </div>
  );
}
