'use client';

import { Plus } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadCover } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';

type Props = {
  value: string;
  onChange: (url: string) => void;
  id?: string;
  /** Forwarded by shadcn's `<FormControl>` Slot; land it on the visible trigger button so the
   *  "Upload a cover photo" message is programmatically associated with the actual control.
   *  No `aria-invalid` here: the trigger is a `role="button"` and that role doesn't support it
   *  (jsx-a11y correctly flags it) — `aria-describedby` alone conveys the error. */
  'aria-describedby'?: string;
};

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Mockup A5 `.gal.six`: the current cover (or an empty frame) and an Upload / Replace tile. */
export function CoverUploader({ value, onChange, id, 'aria-describedby': describedBy }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadCover(file);
      onChange(url);
      toast.success('Cover uploaded');
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Upload failed — try again' });
    } finally {
      setBusy(false);
      // Clear the selection so picking the same file again fires `change`.
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,240px)_140px] gap-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-line">
        {value ? (
          <Image src={value} alt="" fill sizes="240px" className="object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-sm text-mute">No cover yet</span>
        )}
      </div>
      <button
        type="button"
        id={id}
        aria-describedby={describedBy}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="grid aspect-[16/10] place-items-center rounded-card border-[1.5px] border-dashed border-line text-center text-[13px] font-semibold text-mute transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
      >
        <span>
          <Plus className="mx-auto size-5" aria-hidden />
          {busy ? 'Uploading…' : value ? 'Replace cover' : 'Upload'}
          <br />
          <span className="font-normal">JPG/PNG/WEBP ≤ 4 MB</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
