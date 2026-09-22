'use client';

import { Plus } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadCover } from '@/lib/admin/client';
import { ApiRequestError } from '@/lib/api-errors';

type Props = { value: string; onChange: (url: string) => void; id?: string };

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Mockup A5 `.gal.six`: the current cover (or an empty frame) and an Upload / Replace tile. */
export function CoverUploader({ value, onChange, id }: Props) {
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
      toast.error(e instanceof ApiRequestError ? e.body.message : 'Upload failed — try again');
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
