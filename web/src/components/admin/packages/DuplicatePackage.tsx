'use client';

import { Copy } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { components } from '@/lib/api-types';

type AdminPackage = components['schemas']['AdminPackage'];

type Props = {
  id: string;
  name: string;
  /** `link` in the A3 table row, `button` in the form header. */
  variant?: 'link' | 'button';
};

/** Deep-copies the package as a draft and opens the copy (06 §C4 `duplicatePackage`). */
export function DuplicatePackage({ id, name, variant = 'button' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    setBusy(true);
    try {
      const copy = await adminRequest<AdminPackage>(`/admin/packages/${id}/duplicate`, {
        method: 'POST',
      });
      toast.success(`${name} duplicated — opening the copy`);
      router.push(`/admin/packages/${copy.id}`);
      router.refresh();
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not duplicate — try again' });
      setBusy(false);
    }
  }

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={duplicate}
        disabled={busy}
        className="ml-3 font-bold text-primary disabled:opacity-60"
      >
        {busy ? 'Duplicating…' : 'Duplicate'}
      </button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={duplicate} disabled={busy}>
      <Copy className="size-4" aria-hidden />
      {busy ? 'Duplicating…' : 'Duplicate'}
    </Button>
  );
}
