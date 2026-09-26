'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { adminRequest } from '@/lib/admin/client';
import { saveDraft, takeDraft } from '@/lib/admin/drafts';
import { reportAdminError } from '@/lib/admin/errors';
import { focusFirstError } from '@/lib/admin/form-errors';
import {
  emptyPackage,
  packageSchema,
  toInput,
  type PackageFieldValues,
  type PackageFormValues,
} from '@/lib/admin/package-schema';
import { useConfirmLeave, useUnsavedChangesGuard } from '@/lib/admin/unsaved';
import { ApiRequestError } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';
import { BasicsPanel } from './BasicsPanel';
import { DeletePackage } from './DeletePackage';
import { DealPanel } from './DealPanel';
import { DeparturesEditor } from './DeparturesEditor';
import { FaqEditor } from './FaqEditor';
import { GalleryUploader } from './GalleryUploader';
import { HotelsEditor } from './HotelsEditor';
import { ItineraryEditor } from './ItineraryEditor';
import { ListEditor } from './ListEditor';
import { StatusPanel } from './StatusPanel';

type AdminPackage = components['schemas']['AdminPackage'];
type AdminDestination = components['schemas']['AdminDestination'];

type Props = { destinations: AdminDestination[] } & (
  { mode: 'create' } | { mode: 'edit'; pkg: AdminPackage }
);

const panel = 'grid gap-4 rounded-card border border-line bg-bg p-5';
const h3 = 'text-base font-extrabold';

/** Top-level keys the api can pin an error on (`itinerary.2.title` pins under `itinerary`);
 *  anything else falls through to the toast. */
const FIELDS = new Set<string>([
  'slug',
  'destinationId',
  'name',
  'summary',
  'themes',
  'nights',
  'departureCity',
  'highlights',
  'inclusions',
  'exclusions',
  'hotels',
  'faq',
  'featured',
  'itinerary',
  'departures',
  'dealPricePaise',
  'dealLabel',
  'dealEndsOn',
]);
/** Lists whose own message renders in an `ArrayError` block rather than under an input. */
const ARRAYS = new Set(['itinerary', 'departures']);
/** The api's stale-edit 409: another tab or device saved this package first. */
const STALE_KEY = 'expectedEditedAt';

/** Where a server field error lands on the form, or null when no field can show it. */
function errorTarget(key: string): FieldPath<PackageFieldValues> | null {
  if (!FIELDS.has(key.split('.')[0] ?? '')) return null;
  if (ARRAYS.has(key)) return `${key}.root` as FieldPath<PackageFieldValues>;
  return key as FieldPath<PackageFieldValues>;
}

function toFieldValues(pkg: AdminPackage): PackageFieldValues {
  return {
    slug: pkg.slug,
    destinationId: pkg.destinationId,
    name: pkg.name,
    summary: pkg.summary,
    themes: pkg.themes,
    nights: pkg.nights,
    departureCity: pkg.departureCity,
    highlights: pkg.highlights,
    inclusions: pkg.inclusions,
    exclusions: pkg.exclusions,
    hotels: pkg.hotels,
    faq: pkg.faq,
    featured: pkg.featured,
    itinerary: pkg.itinerary.map((d) => ({
      title: d.title,
      description: d.description,
      meals: d.meals,
      stay: d.stay,
    })),
    departures: pkg.departures.map((d) => ({
      id: d.id,
      date: d.date,
      seatsTotal: d.seatsTotal,
      guaranteed: d.guaranteed,
      priceDoublePaise: d.priceDoublePaise,
      priceTriplePaise: d.priceTriplePaise,
      priceChildPaise: d.priceChildPaise,
      singleSupplementPaise: d.singleSupplementPaise,
    })),
    dealPricePaise: pkg.dealPricePaise ?? '',
    dealLabel: pkg.dealLabel ?? '',
    dealEndsOn: pkg.dealEndsOn ?? '',
  };
}

/**
 * Mockup A4 as one form. The gallery, status panel and danger zone sit outside the `<form>`
 * element — they issue their own requests the moment the owner acts, and nesting them would
 * risk a stray submit.
 */
export function PackageForm(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const confirmLeave = useConfirmLeave();
  const pkg = props.mode === 'edit' ? props.pkg : null;
  const editing = pkg !== null;
  const draftKey = `package:${pkg?.id ?? 'new'}`;
  const form = useForm<PackageFieldValues, unknown, PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: pkg ? toFieldValues(pkg) : emptyPackage(props.destinations[0]?.id ?? ''),
  });
  const root = useRef<HTMLDivElement>(null);
  const { release } = useUnsavedChangesGuard(form.formState.isDirty);

  /* Optimistic concurrency. `expected` is the version (`editedAt`) this form edits against,
     sent with every save so the api can refuse to overwrite a newer one. Only form saves move
     `editedAt`, so a publish or a photo change refreshes the page without touching it. */
  const expected = useRef<string | null>(pkg?.editedAt ?? null);
  /** The last version the server handed this page, to spot a refresh that brought a new one. */
  const seen = useRef<string | null>(pkg?.editedAt ?? null);
  /** A restored sign-in draft edits against the version it was parked with; a refresh must not
   *  quietly move it forward until the owner saves or reloads. */
  const pinned = useRef(false);

  useEffect(() => {
    if (!pkg || pkg.editedAt === seen.current) return;
    seen.current = pkg.editedAt;
    // Somebody else saved. A clean form follows them; a dirty (or restored) one keeps its
    // version on purpose, so its save answers 409 instead of overwriting what they wrote.
    if (pinned.current || form.formState.isDirty) return;
    form.reset(toFieldValues(pkg));
    expected.current = pkg.editedAt;
  }, [pkg, form]);

  // Back from a sign-in (or a stale-edit reload) that interrupted an edit: put the parked
  // values back, still dirty, over what the server has now.
  useEffect(() => {
    const draft = takeDraft<PackageFieldValues>(draftKey);
    if (!draft) return;
    form.reset(draft.values, { keepDefaultValues: true });
    if (draft.expectedVersion) {
      expected.current = draft.expectedVersion;
      pinned.current = true;
    }
    const message = draft.expectedVersion
      ? 'Restored unsaved changes'
      : 'Restored your edits over the latest version — saving replaces it';
    // A tick later: the shell's Toaster mounts after the page content.
    setTimeout(() => toast.success(message), 0);
  }, [draftKey, form]);

  function onInvalid() {
    toast.error('Could not save — fix the highlighted fields');
    focusFirstError(root.current);
  }

  /** Another tab or device saved first. Reloading shows theirs; the owner's own edits are
   *  parked and laid back on top, so choosing to look never costs them their work. */
  function reportStale(message: string) {
    const reload = (keep: boolean) => {
      if (keep) saveDraft(draftKey, { values: form.getValues(), expectedVersion: null });
      release();
      window.location.reload();
    };
    toast.error(message, {
      duration: Infinity,
      action: { label: 'Reload, keep my edits', onClick: () => reload(true) },
      cancel: { label: 'Discard mine', onClick: () => reload(false) },
    });
  }

  async function onSubmit(values: PackageFormValues) {
    const body = { ...toInput(values), expectedEditedAt: expected.current };
    // What the inputs held when the request left. Anything typed while it is in flight is
    // newer than the save and must survive the reset below.
    const sent = JSON.stringify(form.getValues());
    try {
      if (pkg) {
        const saved = await adminRequest<AdminPackage>(`/admin/packages/${pkg.id}`, {
          method: 'PUT',
          body,
        });
        const current = form.getValues();
        // The saved package is the new baseline either way; later keystrokes are laid back on
        // top of it, still dirty, so the guard keeps protecting them.
        form.reset(toFieldValues(saved));
        if (JSON.stringify(current) !== sent) form.reset(current, { keepDefaultValues: true });
        expected.current = seen.current = saved.editedAt;
        pinned.current = false;
        toast.success('Saved — the public pages refresh in a few seconds');
        router.refresh();
      } else {
        const created = await adminRequest<AdminPackage>('/admin/packages', {
          method: 'POST',
          body,
        });
        form.reset(toFieldValues(created));
        toast.success('Draft saved — add photos, then publish');
        router.push(`/admin/packages/${created.id}`);
        router.refresh();
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) {
        // A 400/409 with fieldErrors: pin each message on its field. Keep this branch first —
        // a field-level error must land on the fields, never redirect via reportAdminError.
        const entries = Object.entries(e.body.fieldErrors);
        const stale = entries.find(([key]) => key === STALE_KEY);
        if (stale) {
          reportStale(stale[1]);
          return;
        }
        const unpinned: string[] = [];
        let pinnedCount = 0;
        for (const [key, message] of entries) {
          const target = errorTarget(key);
          if (target) {
            form.setError(target, { type: 'server', message });
            pinnedCount += 1;
          } else {
            unpinned.push(message);
          }
        }
        if (pinnedCount || unpinned.length) {
          // Always say what went wrong: a message no field can show goes in the toast word
          // for word; when every message found its field, the toast points at them.
          toast.error(unpinned.length ? unpinned.join(' · ') : e.body.message);
          if (pinnedCount) focusFirstError(root.current);
          return;
        }
      }
      reportAdminError(e, {
        router,
        pathname,
        fallback: 'Could not save — try again',
        onSessionExpired: () => {
          saveDraft(draftKey, { values: form.getValues(), expectedVersion: expected.current });
          release();
        },
      });
    }
  }

  const busy = form.formState.isSubmitting;

  return (
    /* One provider over both columns: the hotels editor lives in the right column but its
       values belong to the same form, and react-hook-form tracks state in JS rather than
       through the DOM, so a field outside the <form> element still submits with it. */
    <Form {...form}>
      <div ref={root} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="grid gap-4" noValidate>
          <section className={panel}>
            <h3 className={h3}>Basics</h3>
            <BasicsPanel
              destinations={props.destinations}
              editing={editing}
              slugLocked={pkg?.slugLocked ?? false}
            />
          </section>

          <section className={panel}>
            <ItineraryEditor />
          </section>

          <section className={panel}>
            <DeparturesEditor />
          </section>

          <section className={panel}>
            <DealPanel saved={pkg} />
          </section>

          <section className={panel}>
            <h3 className={h3}>Inclusions, exclusions and FAQ</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ListEditor
                name="inclusions"
                label="Included · one per line"
                description="What the price covers"
              />
              <ListEditor
                name="exclusions"
                label="Not included · one per line"
                description="What it does not"
              />
            </div>
            <ListEditor
              name="highlights"
              label="Highlights · one per line"
              description="Shown on the card and the page"
              rows={4}
            />
            <FaqEditor />
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => confirmLeave(() => router.push('/admin/packages'))}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>

        <div className="grid content-start gap-4">
          {pkg && (
            <section className={panel}>
              <h3 className={h3}>Status</h3>
              <StatusPanel pkg={pkg} />
            </section>
          )}

          <section className={panel}>
            <h3 className={h3}>Gallery</h3>
            {pkg ? (
              <GalleryUploader
                packageId={pkg.id}
                images={pkg.images}
                coverImageId={pkg.coverImageId}
              />
            ) : (
              <GalleryUploader packageId="" images={[]} coverImageId={null} disabled />
            )}
          </section>

          <section className={panel}>
            <h3 className={h3}>Hotels</h3>
            <HotelsEditor />
          </section>

          {pkg && (
            <section className={panel}>
              <h3 className={h3}>Danger zone</h3>
              <DeletePackage id={pkg.id} name={pkg.name} enquiryCount={pkg.enquiryCount} />
            </section>
          )}
        </div>
      </div>
    </Form>
  );
}
