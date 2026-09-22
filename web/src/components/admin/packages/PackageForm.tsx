'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import {
  emptyPackage,
  packageSchema,
  toInput,
  type PackageFieldValues,
  type PackageFormValues,
} from '@/lib/admin/package-schema';
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

/** Top-level keys the api can pin an error on; anything else falls through to the toast. */
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
const isField = (key: string): key is keyof PackageFieldValues => FIELDS.has(key);

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
  const editing = props.mode === 'edit';
  const form = useForm<PackageFieldValues, unknown, PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: editing
      ? toFieldValues(props.pkg)
      : emptyPackage(props.destinations[0]?.id ?? ''),
  });

  async function onSubmit(values: PackageFormValues) {
    const body = toInput(values);
    try {
      if (editing) {
        await adminRequest(`/admin/packages/${props.pkg.id}`, { method: 'PUT', body });
        toast.success('Saved — the public pages refresh in a few seconds');
        router.refresh();
      } else {
        const created = await adminRequest<AdminPackage>('/admin/packages', {
          method: 'POST',
          body,
        });
        toast.success('Draft saved — add photos, then publish');
        router.push(`/admin/packages/${created.id}`);
        router.refresh();
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) {
        // A 400/409 with fieldErrors: pin each message on its field. Keep this branch first —
        // a field-level error must land on the fields, never redirect via reportAdminError.
        let first: keyof PackageFieldValues | undefined;
        for (const [field, message] of Object.entries(e.body.fieldErrors)) {
          if (!isField(field)) continue;
          form.setError(field, { type: 'server', message });
          first ??= field;
        }
        if (first) {
          form.setFocus(first);
          return;
        }
      }
      reportAdminError(e, { router, pathname, fallback: 'Could not save — try again' });
    }
  }

  const busy = form.formState.isSubmitting;

  return (
    /* One provider over both columns: the hotels editor lives in the right column but its
       values belong to the same form, and react-hook-form tracks state in JS rather than
       through the DOM, so a field outside the <form> element still submits with it. */
    <Form {...form}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <section className={panel}>
            <h3 className={h3}>Basics</h3>
            <BasicsPanel destinations={props.destinations} editing={editing} />
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
              onClick={() => router.push('/admin/packages')}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>

        <div className="grid content-start gap-4">
          {editing && (
            <section className={panel}>
              <h3 className={h3}>Status</h3>
              <StatusPanel pkg={props.pkg} />
            </section>
          )}

          <section className={panel}>
            <h3 className={h3}>Gallery</h3>
            {editing ? (
              <GalleryUploader
                packageId={props.pkg.id}
                images={props.pkg.images}
                coverImageId={props.pkg.coverImageId}
              />
            ) : (
              <GalleryUploader packageId="" images={[]} coverImageId={null} disabled />
            )}
          </section>

          <section className={panel}>
            <h3 className={h3}>Hotels</h3>
            <HotelsEditor />
          </section>

          {editing && (
            <section className={panel}>
              <h3 className={h3}>Danger zone</h3>
              <DeletePackage
                id={props.pkg.id}
                name={props.pkg.name}
                enquiryCount={props.pkg.enquiryCount}
              />
            </section>
          )}
        </div>
      </div>
    </Form>
  );
}
