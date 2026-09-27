'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';
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
import { LABEL, PackagePreview, type SectionKey } from './PackagePreview';
import { StatusPanel } from './StatusPanel';

type AdminPackage = components['schemas']['AdminPackage'];
type AdminDestination = components['schemas']['AdminDestination'];

type Props = { destinations: AdminDestination[] } & (
  { mode: 'create' } | { mode: 'edit'; pkg: AdminPackage }
);

type Key = SectionKey | 'status' | 'danger';
const ALL: Key[] = [
  'status',
  'photos',
  'title',
  'highlights',
  'itinerary',
  'prices',
  'deal',
  'stays',
  'included',
  'danger',
];

/**
 * One editor section: a header button that opens and closes it, the body kept mounted either
 * way so every field still validates and submits. Opening one from the preview scrolls to it.
 */
function Section({
  k,
  title,
  sub,
  open,
  onToggle,
  children,
}: {
  k: Key;
  title: string;
  sub?: string;
  open: boolean;
  onToggle: (k: Key) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`pk-${k}`}
      data-section={k}
      className={cn(
        'scroll-mt-4 overflow-hidden rounded-card border bg-bg transition-colors',
        open ? 'border-primary/40' : 'border-line',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`pk-${k}-body`}
        onClick={() => onToggle(k)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid min-w-0 flex-1">
          <b className="text-[14.5px] font-extrabold">{title}</b>
          {sub && <small className="truncate text-[12.5px] text-mute">{sub}</small>}
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-mute transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div id={`pk-${k}-body`} hidden={!open} className="grid gap-4 border-t border-line p-4">
        {children}
      </div>
    </section>
  );
}

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
 * Package editor B · Live preview (R59, P20): short sections in the order the page reads, beside
 * the customer page updating as the owner types; clicking the preview opens the matching section.
 * On a phone an Edit / Preview switch shows one side. The save bar turns amber on the first edit.
 *
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
  const [open, setOpen] = useState<Set<Key>>(() => new Set<Key>(['title']));
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
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
    // Open every section so the first highlighted field can take focus.
    setOpen(new Set(ALL));
    setTimeout(() => focusFirstError(root.current), 0);
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
          if (pinnedCount) {
            setOpen(new Set(ALL)); // the field may sit in a closed section
            setTimeout(() => focusFirstError(root.current), 0);
          }
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
  const dirty = form.formState.isDirty;
  const values = form.watch();
  const rules = pkg?.publishRules ?? [];
  const destination =
    props.destinations.find((d) => d.id === values.destinationId)?.name ?? 'Destination';
  const photos = pkg
    ? [...pkg.images]
        .sort((a, b) => Number(b.id === pkg.coverImageId) - Number(a.id === pkg.coverImageId))
        .map((i) => i.url)
    : [];
  const days = values.itinerary?.length ?? 0;
  const dates = values.departures?.length ?? 0;
  const sub: Partial<Record<Key, string>> = {
    status: rules.length
      ? `${pkg?.status === 'live' ? 'Live' : 'Draft'} · ${rules.filter((r) => r.ok).length} of 4 checks`
      : undefined,
    photos: pkg
      ? `${pkg.images.length} ${pkg.images.length === 1 ? 'photo' : 'photos'}`
      : 'After the first save',
    title: `${destination} · ${values.nights || '…'} nights · Ex-${values.departureCity || '…'}${values.featured ? ' · Featured' : ''}`,
    highlights: `${values.highlights?.filter((l) => l?.trim()).length ?? 0} lines`,
    itinerary: `${days} ${days === 1 ? 'day' : 'days'} written`,
    prices: `${dates} ${dates === 1 ? 'date' : 'dates'}`,
    deal: values.dealPricePaise ? 'Deal set' : 'No deal',
    stays: `${values.hotels?.length ?? 0} hotels`,
    included: `${values.inclusions?.filter((l) => l?.trim()).length ?? 0} in · ${values.exclusions?.filter((l) => l?.trim()).length ?? 0} out · ${values.faq?.length ?? 0} questions`,
  };
  const toggle = (k: Key) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const pick = (k: SectionKey) => {
    setPane('edit');
    setOpen((was) => new Set(was).add(k));
    requestAnimationFrame(() =>
      document.getElementById(`pk-${k}`)?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      }),
    );
  };
  const section = (k: Key, children: React.ReactNode, title = LABEL[k as SectionKey]) => (
    <Section k={k} title={title} sub={sub[k]} open={open.has(k)} onToggle={toggle}>
      {children}
    </Section>
  );

  return (
    /* One provider over both columns: the hotels editor lives in the right column but its
       values belong to the same form, and react-hook-form tracks state in JS rather than
       through the DOM, so a field outside the <form> element still submits with it. */
    <Form {...form}>
      <div role="group" aria-label="Show" className="flex gap-1 rounded-lg bg-bg2 p-1 lg:hidden">
        {(
          [
            ['edit', 'Edit'],
            ['preview', 'Preview'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={pane === k}
            onClick={() => setPane(k)}
            className={cn(
              'flex-1 rounded-md py-1.5 text-[13px] font-bold',
              pane === k ? 'bg-bg text-ink shadow-sm' : 'text-mute',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        ref={root}
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
      >
        <div className={cn('grid min-w-0 gap-3', pane !== 'edit' && 'max-lg:hidden')}>
          {pkg && section('status', <StatusPanel pkg={pkg} />, 'Publish checks')}
          {section(
            'photos',
            pkg ? (
              <GalleryUploader
                packageId={pkg.id}
                images={pkg.images}
                coverImageId={pkg.coverImageId}
              />
            ) : (
              <GalleryUploader packageId="" images={[]} coverImageId={null} disabled />
            ),
          )}
          {/* The gallery, status and danger zone sit outside the <form> element — they issue
              their own requests the moment the owner acts, and nesting them would risk a stray
              submit. react-hook-form tracks values in JS, so the sections still share one form. */}
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="grid gap-3" noValidate>
            {section(
              'title',
              <BasicsPanel
                destinations={props.destinations}
                editing={editing}
                slugLocked={pkg?.slugLocked ?? false}
              />,
            )}
            {section(
              'highlights',
              <ListEditor
                name="highlights"
                label="Highlights · one per line"
                description="Shown on the card and the page"
                rows={4}
              />,
            )}
            {section('itinerary', <ItineraryEditor />)}
            {section('prices', <DeparturesEditor />)}
            {section('deal', <DealPanel saved={pkg} />)}
            {section('stays', <HotelsEditor />)}
            {section(
              'included',
              <>
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
                <FaqEditor />
              </>,
            )}
            <div
              className={cn(
                'sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-card border px-3 py-2.5 shadow-[0_-10px_30px_-24px_rgba(20,32,42,.5)] transition-colors',
                dirty ? 'border-action bg-warn-soft' : 'border-line bg-bg',
              )}
            >
              <span
                role="status"
                className={cn('text-[13px] font-bold', dirty ? 'text-warn' : 'text-mute')}
              >
                {dirty ? 'Unsaved changes' : editing ? 'All changes saved' : 'New package'}
              </span>
              <span className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => confirmLeave(() => router.push('/admin/packages'))}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}
                </Button>
              </span>
            </div>
          </form>
          {pkg &&
            section(
              'danger',
              <DeletePackage id={pkg.id} name={pkg.name} enquiryCount={pkg.enquiryCount} />,
              'Delete',
            )}
        </div>
        <div className={cn('min-w-0 lg:sticky lg:top-4', pane !== 'preview' && 'max-lg:hidden')}>
          <PackagePreview
            destination={destination}
            coverUrl={photos[0] ?? null}
            photos={photos}
            onPick={pick}
          />
        </div>
      </div>
    </Form>
  );
}
