'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminRequest } from '@/lib/admin/client';
import {
  destinationSchema,
  type DestinationFormValues,
  toInput,
} from '@/lib/admin/destination-schema';
import { ApiRequestError } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';
import { CoverUploader } from './CoverUploader';
import { DeleteDestination } from './DeleteDestination';
import { MonthPicker } from './MonthPicker';

type AdminDestination = components['schemas']['AdminDestination'];

type Props = { mode: 'create' } | { mode: 'edit'; destination: AdminDestination };

/** What the inputs hold (`position` may be a string until zod coerces it). */
type FieldValues = z.input<typeof destinationSchema>;

const EMPTY: FieldValues = {
  slug: '',
  name: '',
  tagline: '',
  intro: '',
  coverUrl: '',
  region: '',
  bestMonths: [],
  position: 0,
};

const FIELDS = new Set<string>(Object.keys(EMPTY));
const isField = (key: string): key is keyof FieldValues => FIELDS.has(key);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const panel = 'grid gap-4 rounded-card border border-line bg-bg p-5';
const h3 = 'text-base font-extrabold';

/** Mockup A5's edit panel as a page: basics, cover, best months, danger zone. Server-side errors land on their field. */
export function DestinationForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === 'edit';
  const form = useForm<FieldValues, unknown, DestinationFormValues>({
    resolver: zodResolver(destinationSchema),
    defaultValues: editing
      ? {
          slug: props.destination.slug,
          name: props.destination.name,
          tagline: props.destination.tagline,
          intro: props.destination.intro,
          coverUrl: props.destination.coverUrl,
          region: props.destination.region,
          bestMonths: props.destination.bestMonths,
          position: props.destination.position,
        }
      : EMPTY,
  });

  async function onSubmit(values: DestinationFormValues) {
    const body = toInput(values);
    try {
      if (editing) {
        await adminRequest(`/admin/destinations/${props.destination.id}`, { method: 'PUT', body });
        toast.success('Saved — the public pages refresh in a few seconds');
      } else {
        await adminRequest('/admin/destinations', { method: 'POST', body });
        toast.success('Destination created');
      }
      router.push('/admin/destinations');
      router.refresh();
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) {
        // A 400/409 with fieldErrors: pin each message under its field; anything the form has
        // no field for (e.g. `body`) falls through to the toast.
        let placed = false;
        for (const [field, message] of Object.entries(e.body.fieldErrors)) {
          if (!isField(field)) continue;
          form.setError(field, { type: 'server', message });
          placed = true;
        }
        if (placed) return;
      }
      toast.error(e instanceof ApiRequestError ? e.body.message : 'Could not save — try again');
    }
  }

  const busy = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-[860px] gap-4" noValidate>
        <section className={panel}>
          <h3 className={h3}>Basics</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        // Follow the name until the owner edits the slug themselves; after a
                        // failed submit, re-validate so a stale "Required" clears as it fills.
                        if (!editing && !form.getFieldState('slug').isDirty)
                          form.setValue('slug', slugify(e.target.value), {
                            shouldValidate: form.formState.isSubmitted,
                          });
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="goa" />
                  </FormControl>
                  <FormDescription>
                    {editing
                      ? 'Changing this moves the public page; the old address stops working.'
                      : 'The public address: /destinations/<slug>.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="tagline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tagline</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={80} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Region</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="West India" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="intro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Intro</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={7} />
                </FormControl>
                <FormDescription>
                  Markdown, 2–3 paragraphs. **Bold** works; blank line = new paragraph.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <FormField
              control={form.control}
              name="bestMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Best months</FormLabel>
                  <FormControl>
                    <MonthPicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={0} max={999} inputMode="numeric" />
                  </FormControl>
                  <FormDescription>Lower shows first.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className={panel}>
          <h3 className={h3}>Cover</h3>
          <FormField
            control={form.control}
            name="coverUrl"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <CoverUploader value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create destination'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/destinations')}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>

        {editing && (
          <section className={panel}>
            <h3 className={h3}>Danger zone</h3>
            <DeleteDestination
              id={props.destination.id}
              name={props.destination.name}
              packageCount={props.destination.packageCount}
            />
          </section>
        )}
      </form>
    </Form>
  );
}
