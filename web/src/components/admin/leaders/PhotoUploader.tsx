'use client';

import { ImagePlus, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState, type Ref } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import { uploadLeaderPhoto } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';

type Props = {
  /** react-hook-form's field ref, so a server error on `photoUrl` focuses the button. */
  ref?: Ref<HTMLButtonElement>;
  value: string;
  onChange: (url: string) => void;
  /** What the monogram is drawn from while there is no photo. */
  slug: string;
  name: string;
  id?: string;
  'aria-describedby'?: string;
};

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** The leader's face: their photo, or the monogram the site draws until one is uploaded. */
export function PhotoUploader({ ref, value, onChange, slug, name, id, ...rest }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadLeaderPhoto(file);
      onChange(url);
      toast.success('Photo uploaded — save to keep it');
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Upload failed — try again' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <LeaderAvatar
        leader={{ slug: slug || 'new', name: name || '?', photoUrl: value }}
        size={88}
      />
      <div className="grid gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            ref={ref}
            id={id}
            aria-describedby={rest['aria-describedby']}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden />
            {busy ? 'Uploading…' : value ? 'Replace photo' : 'Upload photo'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
              <X className="size-4" aria-hidden />
              Use the monogram
            </Button>
          )}
        </div>
        <small className="text-[12.5px] text-mute">
          JPG/PNG/WEBP ≤ 4 MB. Without a photo the site draws this monogram.
        </small>
      </div>
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
