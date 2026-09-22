'use client';

import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Star, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminRequest, uploadPackageImage } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { movedIndices, reorder } from '@/lib/admin/sortable';
import { useSortableSensors } from '@/lib/admin/sortable';
import type { components } from '@/lib/api-types';

type AdminImage = components['schemas']['AdminImage'];

const ACCEPT = 'image/jpeg,image/png,image/webp';

function Tile({
  image,
  index,
  isCover,
  onMakeCover,
  onAlt,
  onDelete,
  busy,
}: {
  image: AdminImage;
  index: number;
  isCover: boolean;
  onMakeCover: () => void;
  onAlt: (alt: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid gap-2 rounded-md border border-line p-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded bg-line">
        <Image src={image.url} alt={image.alt} fill sizes="200px" className="object-cover" />
        {isCover && (
          <span className="absolute top-1 left-1 rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-bold text-bg">
            Cover
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Reorder photo ${index + 1}`}
          className="cursor-grab rounded p-1 text-mute hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Make photo ${index + 1} the cover`}
          disabled={busy || isCover}
          onClick={onMakeCover}
        >
          <Star className={`size-4 ${isCover ? 'fill-current' : ''}`} aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label={`Delete photo ${index + 1}`}
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <Input
        defaultValue={image.alt}
        aria-label={`Alt text, photo ${index + 1}`}
        placeholder="Describe the photo"
        className="h-8 text-[13px]"
        onBlur={(e) => {
          if (e.target.value !== image.alt) onAlt(e.target.value);
        }}
      />
    </div>
  );
}

type Props = {
  packageId: string;
  images: AdminImage[];
  coverImageId: string | null;
  /** Create mode: there is no package id yet, so uploads have nowhere to go. */
  disabled?: boolean;
};

/**
 * Mockup A4's gallery. These writes are immediate rather than staged in the form: the package
 * already exists, and staging them would leave a half-saved gallery behind whenever validation
 * failed somewhere else on the page.
 */
export function GalleryUploader({ packageId, images, coverImageId, disabled }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Shown while a reorder is in flight so the tile does not snap back under the pointer.
  const [optimistic, setOptimistic] = useState<AdminImage[] | null>(null);
  const sensors = useSortableSensors();
  const shown = optimistic ?? images;

  if (disabled) {
    return (
      <p className="rounded-md border border-dashed border-line p-4 text-sm text-mute">
        Save the draft first, then add photos.
      </p>
    );
  }

  async function run(work: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    try {
      await work();
      router.refresh();
    } catch (e) {
      setOptimistic(null);
      reportAdminError(e, { router, pathname, fallback });
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    try {
      // Sequential on purpose: `position` is derived from the current maximum on the server,
      // so parallel uploads would race for the same slot.
      for (const file of Array.from(files)) {
        await uploadPackageImage(packageId, file);
        added += 1;
      }
      toast.success(`${added} ${added === 1 ? 'photo' : 'photos'} uploaded`);
      router.refresh();
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Upload failed — try again' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function saveOrder(next: AdminImage[], coverId: string | null) {
    setOptimistic(next);
    void run(
      () =>
        adminRequest(`/admin/packages/${packageId}/images`, {
          method: 'PATCH',
          body: { order: next.map((i) => i.id), coverId },
        }),
      'Could not reorder — try again',
    ).then(() => setOptimistic(null));
  }

  function onDragEnd(event: DragEndEvent) {
    const moved = movedIndices(
      event,
      shown.map((i) => i.id),
    );
    if (moved) saveOrder(reorder(shown, moved.from, moved.to), coverImageId);
  }

  return (
    <div className="grid gap-3">
      {shown.length === 0 && (
        <p className="text-sm text-mute">
          No photos yet — a package needs one before it can go live.
        </p>
      )}

      <DndContext
        id="package-gallery"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={shown.map((i) => i.id)} strategy={rectSortingStrategy}>
          {/* Two columns, full stop: this panel lives in a 320 px sidebar, so viewport
              breakpoints would widen the grid while the column stayed narrow. */}
          <div className="grid grid-cols-2 gap-3">
            {shown.map((image, i) => (
              <Tile
                key={image.id}
                image={image}
                index={i}
                isCover={image.id === coverImageId}
                busy={busy}
                onMakeCover={() => saveOrder(shown, image.id)}
                onAlt={(alt) =>
                  void run(
                    () =>
                      adminRequest(`/admin/packages/${packageId}/images/${image.id}`, {
                        method: 'PATCH',
                        body: { alt },
                      }),
                    'Could not save the alt text — try again',
                  )
                }
                onDelete={() =>
                  void run(
                    () =>
                      adminRequest(`/admin/packages/${packageId}/images/${image.id}`, {
                        method: 'DELETE',
                      }),
                    'Could not delete the photo — try again',
                  )
                }
              />
            ))}

            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="grid aspect-[4/3] place-items-center rounded-md border-[1.5px] border-dashed border-line text-center text-[13px] font-semibold text-mute transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
            >
              <span>
                <Plus className="mx-auto size-5" aria-hidden />
                {busy ? 'Working…' : 'Upload'}
                <br />
                <span className="font-normal">JPG/PNG/WEBP ≤ 4 MB</span>
              </span>
            </button>
          </div>
        </SortableContext>
      </DndContext>

      <p className="text-[13px] text-mute">
        Drag to reorder. Alt text describes the photo for screen readers and shows if the image
        fails to load.
      </p>

      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => void upload(e.target.files)}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
