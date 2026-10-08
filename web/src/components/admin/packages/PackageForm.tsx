'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useFormState, useWatch, type FieldPath } from 'react-hook-form';
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
import { AddonsEditor } from './AddonsEditor';
import { BasicsPanel } from './BasicsPanel';
import { DeletePackage } from './DeletePackage';
import { DealPanel } from './DealPanel';
import { DepositPanel } from './DepositPanel';
import { DetailsPanel } from './DetailsPanel';
import { EarlyBirdPanel } from './EarlyBirdPanel';
import { DeparturesEditor } from './DeparturesEditor';
import { FaqEditor } from './FaqEditor';
import { GalleryUploader } from './GalleryUploader';
import { HotelsEditor } from './HotelsEditor';
import { LeaderPanel } from './LeaderPanel';
import { ItineraryEditor } from './ItineraryEditor';
import { ListEditor } from './ListEditor';
import { LABEL, PackagePreview, type SectionKey } from './PackagePreview';
import { StatusPanel } from './StatusPanel';

type AdminPackage = components['schemas']['AdminPackage'];
type AdminDestination = components['schemas']['AdminDestination'];
type AdminLeader = components['schemas']['AdminLeader'];

type Props = { destinations: AdminDestination[]; leaders: AdminLeader[] } & (
  { mode: 'create' } | { mode: 'edit'; pkg: AdminPackage }
);

type Key = SectionKey | 'status' | 'danger';
const ALL: Key[] = [
  'status',
  'photos',
  'title',
  'leader',
  'highlights',
  'itinerary',
  'prices',
  'deal',
  'addons',
  'details',
  'stays',
  'included',
  'danger',
];

/** The fields each section edits: its subtitle and its error count read only these. */
const FIELDS_OF: Partial<Record<Key, FieldPath<PackageFieldValues>[]>> = {
  title: [
    'name',
    'slug',
    'destinationId',
    'summary',
    'themes',
    'nights',
    'departureCity',
    'featured',
  ],
  leader: ['leaderId'],
  highlights: ['highlights'],
  itinerary: ['itinerary'],
  prices: ['departures'],
  deal: [
    'dealPricePaise',
    'dealLabel',
    'dealEndsOn',
    'ebOn',
    'eb1Days',
    'eb1OffPaise',
    'eb2Days',
    'eb2OffPaise',
    'depositOn',
  ],
  addons: ['addons'],
  details: ['detailsRequired', 'checklist'],
  stays: ['hotels'],
  included: ['inclusions', 'exclusions', 'faq'],
};

const count = (xs: unknown) =>
  Array.isArray(xs) ? xs.filter((x) => (typeof x === 'string' ? x.trim() : x)).length : 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A section's live subtitle and error count. It subscribes to its own fields only, so typing in
 * one section re-renders this line, not the whole form and its field arrays.
 */
function LiveSub({
  k,
  destinations,
  leaders = [],
  waiting = 0,
}: {
  k: Key;
  destinations: readonly { id: string; name: string }[];
  /** P3: names for the leader section's subtitle. */
  leaders?: readonly { id: string; name: string }[];
  /** P6: places on the saved dates' waitlists, shown on the collapsed dates section. */
  waiting?: number;
}) {
  const names = FIELDS_OF[k] ?? [];
  const values = useWatch<PackageFieldValues>({ name: names }) as unknown[];
  const { errors } = useFormState<PackageFieldValues>({ name: names });
  const v = Object.fromEntries(names.map((n, i) => [n, values[i]])) as Record<string, unknown>;
  const bad = names.filter((n) => n in errors).length;
  let text = '';
  if (k === 'title') {
    const dest = destinations.find((d) => d.id === v.destinationId)?.name ?? 'No destination';
    text = `${dest} · ${String(v.nights || '…')} nights · ${String(v.departureCity || '…')}${v.featured ? ' · Featured' : ''}`;
  } else if (k === 'leader')
    text = leaders.find((l) => l.id === v.leaderId)?.name ?? 'No leader yet';
  else if (k === 'highlights') text = plural(count(v.highlights), 'line');
  else if (k === 'itinerary') text = `${plural(count(v.itinerary), 'day')} written`;
  else if (k === 'prices')
    text = `${plural(count(v.departures), 'date')}${waiting ? ` · ${waiting} waiting` : ''}`;
  else if (k === 'deal')
    text = `${v.dealPricePaise ? 'Deal set' : 'No deal'} · ${v.ebOn ? 'Early bird on' : 'No early bird'}${v.depositOn === false ? ' · No deposit' : ''}`;
  else if (k === 'addons') {
    const all = Array.isArray(v.addons) ? (v.addons as { active?: boolean }[]) : [];
    const on = all.filter((a) => a?.active).length;
    text = all.length ? `${plural(all.length, 'add-on')} · ${on} on sale` : 'None yet';
  } else if (k === 'details') {
    const req = Array.isArray(v.detailsRequired) ? v.detailsRequired.length : 0;
    text = `${req} required · ${plural(count(v.checklist), 'checklist item')}`;
  } else if (k === 'stays') text = plural(count(v.hotels), 'hotel');
  else if (k === 'included')
    text = `${count(v.inclusions)} in · ${count(v.exclusions)} out · ${plural(count(v.faq), 'question')}`;
  return (
    <>
      {text}
      {bad > 0 && (
        <b className="ml-1.5 rounded-chip bg-bad-soft px-1.5 text-[11.5px] text-bad">
          {plural(bad, 'error')}
        </b>
      )}
    </>
  );
}

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
  sub?: React.ReactNode;
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
  'addons',
  'dealPricePaise',
  'dealLabel',
  'dealEndsOn',
  'ebOn',
  'eb1Days',
  'eb1OffPaise',
  'eb2Days',
  'eb2OffPaise',
  'depositOn',
  'leaderId',
]);
/** Lists whose own message renders in an `ArrayError` block rather than under an input. */
const ARRAYS = new Set(['itinerary', 'departures', 'addons']);
/** The api's stale-edit 409: another tab or device saved this package first. */
const STALE_KEY = 'expectedEditedAt';

/** Where a server field error lands on the form, or null when no field can show it. */
function errorTarget(key: string): FieldPath<PackageFieldValues> | null {
  if (key.startsWith('earlyBird')) return earlyBirdTarget(key);
  if (!FIELDS.has(key.split('.')[0] ?? '')) return null;
  if (ARRAYS.has(key)) return `${key}.root` as FieldPath<PackageFieldValues>;
  return key as FieldPath<PackageFieldValues>;
}

/**
 * The api files early-bird errors under `earlyBird`, `earlyBird.tiers` or
 * `earlyBird.tiers.<i>.<field>`; the form has one box per tier field.
 */
function earlyBirdTarget(key: string): FieldPath<PackageFieldValues> {
  const m = /^earlyBird\.tiers\.([01])\.(days|offPaise)$/.exec(key);
  if (m) {
    const tier = m[1] === '0' ? 'eb1' : 'eb2';
    return `${tier}${m[2] === 'days' ? 'Days' : 'OffPaise'}` as FieldPath<PackageFieldValues>;
  }
  return key === 'earlyBird.tiers' ? 'eb2Days' : 'eb1Days';
}

function toFieldValues(pkg: AdminPackage): PackageFieldValues {
  const tiers = pkg.earlyBird?.tiers ?? []; // an api from before P17 sends none
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
    depositOn: pkg.depositOn ?? true, // an api from before P5 sends none
    leaderId: pkg.leaderId ?? '',
    // P9: an api from before P9 sends none.
    detailsRequired: pkg.travellerDetails?.required ?? ['id', 'emergency', 'food'],
    checklist: (pkg.travellerDetails?.checklist ?? []).map((i) => ({ ...i })),
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
      leaderId: d.leaderId ?? '',
    })),
    addons: pkg.addons.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      pricePaise: a.pricePaise,
      basis: a.basis,
      maxNights: a.maxNights ?? '',
      imageId: a.imageId,
      active: a.active,
    })),
    dealPricePaise: pkg.dealPricePaise ?? '',
    dealLabel: pkg.dealLabel ?? '',
    dealEndsOn: pkg.dealEndsOn ?? '',
    ebOn: pkg.earlyBird?.on ?? false,
    eb1Days: tiers[0]?.days ?? '',
    eb1OffPaise: tiers[0]?.offPaise ?? '',
    eb2Days: tiers[1]?.days ?? '',
    eb2OffPaise: tiers[1]?.offPaise ?? '',
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
  const rules = pkg?.publishRules ?? [];
  const photos = pkg
    ? [...pkg.images]
        .sort((a, b) => Number(b.id === pkg.coverImageId) - Number(a.id === pkg.coverImageId))
        .map((i) => i.url)
    : [];
  const sub: Partial<Record<Key, React.ReactNode>> = {
    status: rules.length
      ? `${pkg?.status === 'live' ? 'Live' : 'Draft'} · ${rules.filter((r) => r.ok).length} of 4 checks`
      : undefined,
    photos: pkg
      ? `${pkg.images.length} ${pkg.images.length === 1 ? 'photo' : 'photos'}`
      : 'After the first save',
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
  const waitingTotal = (pkg?.departures ?? []).reduce((n, d) => n + d.waiting, 0);
  const section = (k: Key, children: React.ReactNode, title = LABEL[k as SectionKey]) => (
    <Section
      k={k}
      title={title}
      sub={
        sub[k] ?? (
          <LiveSub
            k={k}
            destinations={props.destinations}
            leaders={props.leaders}
            waiting={waitingTotal}
          />
        )
      }
      open={open.has(k)}
      onToggle={toggle}
    >
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
            {section('leader', <LeaderPanel leaders={props.leaders} />)}
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
            {section(
              'prices',
              <DeparturesEditor
                waiting={Object.fromEntries((pkg?.departures ?? []).map((d) => [d.id, d.waiting]))}
                leaders={props.leaders}
              />,
            )}
            {section(
              'deal',
              <>
                <DealPanel saved={pkg} />
                <EarlyBirdPanel />
                <DepositPanel />
              </>,
            )}
            {section(
              'addons',
              <AddonsEditor images={pkg?.images ?? []} saved={pkg?.addons ?? []} />,
            )}
            {section('details', <DetailsPanel />)}
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
            destinations={props.destinations}
            coverUrl={photos[0] ?? null}
            photos={photos}
            onPick={pick}
          />
        </div>
      </div>
    </Form>
  );
}
