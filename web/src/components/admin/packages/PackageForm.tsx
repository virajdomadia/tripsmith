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
]);
/** Lists whose own message renders in an `ArrayError` block rather than under an input. */
const ARRAYS = new Set(['itinerary', 'departures']);
/** The api's stale-edit 409: another tab or device saved this package first. */
const STALE_KEY = 'expectedUpdatedAt';

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

  /* Optimistic concurrency. `expected` is the version this form edits against, sent with every
     save so the api can refuse to overwrite a newer one. `baseline` is that version's content,
     so a refresh can tell a status or gallery change (same content, new version: follow it)
     from somebody else's edit (new content: keep the old version, so the save answers 409
     rather than silently overwriting what they wrote). */
  const expected = useRef<string | null>(pkg?.updatedAt ?? null);
  const baseline = useRef(pkg ? JSON.stringify(toFieldValues(pkg)) : '');

  useEffect(() => {
    if (!pkg) return;
    const content = JSON.stringify(toFieldValues(pkg));
    if (content === baseline.current) {
      expected.current = pkg.updatedAt;
    } else if (!form.formState.isDirty) {
      form.reset(toFieldValues(pkg));
      baseline.current = content;
      expected.current = pkg.updatedAt;
    }
    // Dirty over somebody else's newer content: `expected` stays behind on purpose.
  }, [pkg, form]);

  // Back from a sign-in that interrupted an edit: put the parked values back, still dirty.
  useEffect(() => {
    const draft = takeDraft<PackageFieldValues>(draftKey);
    if (!draft) return;
    form.reset(draft.values, { keepDefaultValues: true });
    if (draft.expectedUpdatedAt) expected.current = draft.expectedUpdatedAt;
    // A tick later: the shell's Toaster mounts after the page content.
    setTimeout(() => toast.success('Restored unsaved changes'), 0);
  }, [draftKey, form]);

  function onInvalid() {
    toast.error('Could not save — fix the highlighted fields');
    focusFirstError(root.current);
  }

  function reportStale(message: string) {
    toast.error(message, {
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => {
          release();
          window.location.reload();
        },
      },
    });
  }

  async function onSubmit(values: PackageFormValues) {
    const body = { ...toInput(values), expectedUpdatedAt: expected.current };
    try {
      if (pkg) {
        const saved = await adminRequest<AdminPackage>(`/admin/packages/${pkg.id}`, {
          method: 'PUT',
          body,
        });
        const next = toFieldValues(saved);
        form.reset(next);
        baseline.current = JSON.stringify(next);
        expected.current = saved.updatedAt;
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
        let pinned = 0;
        for (const [key, message] of entries) {
          const target = errorTarget(key);
          if (target) {
            form.setError(target, { type: 'server', message });
            pinned += 1;
          } else {
            unpinned.push(message);
          }
        }
        if (pinned) {
          // Always say something: a message with no field to sit under (the gallery, a
          // whole-body rule) goes in the toast; otherwise the toast points at the fields.
          toast.error(unpinned.length ? unpinned.join(' · ') : e.body.message);
          focusFirstError(root.current);
          return;
        }
      }
      reportAdminError(e, {
        router,
        pathname,
        fallback: 'Could not save — try again',
        onSessionExpired: () => {
          saveDraft(draftKey, { values: form.getValues(), expectedUpdatedAt: expected.current });
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
