'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname, useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { SlugField, followSlug } from '@/components/admin/SlugField';
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
import { reportAdminError } from '@/lib/admin/errors';
import {
  EMPTY_LEADER,
  leaderSchema,
  toFieldValues,
  toInput,
  type AdminLeader,
  type LeaderFieldValues,
  type LeaderFormValues,
} from '@/lib/admin/leader-schema';
import { useConfirmLeave, useUnsavedChangesGuard } from '@/lib/admin/unsaved';
import { ApiRequestError } from '@/lib/api-errors';
import { cn } from '@/lib/utils';
import { DeleteLeader } from './DeleteLeader';
import { PhotoUploader } from './PhotoUploader';

type Props = { layout?: 'page' | 'panel' } & (
  { mode: 'create' } | { mode: 'edit'; leader: AdminLeader }
);

const FIELDS = new Set<string>(Object.keys(EMPTY_LEADER));
const isField = (key: string): key is keyof LeaderFieldValues => FIELDS.has(key);

const panel = 'grid gap-4 rounded-card border border-line bg-bg p-5';
const h3 = 'text-base font-extrabold';

/** A trip leader (R41): face, who they are, what travellers read, and the trip-pack phone. */
export function LeaderForm(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const editing = props.mode === 'edit';
  const inPanel = props.layout === 'panel';
  const form = useForm<LeaderFieldValues, unknown, LeaderFormValues>({
    resolver: zodResolver(leaderSchema),
    defaultValues: editing ? toFieldValues(props.leader) : EMPTY_LEADER,
  });
  const onNameChange = followSlug(form, editing);
  const confirmLeave = useConfirmLeave();
  const { release } = useUnsavedChangesGuard(form.formState.isDirty);
  const [slug, name, bio] = useWatch({ control: form.control, name: ['slug', 'name', 'bio'] });

  async function onSubmit(values: LeaderFormValues) {
    const body = toInput(values);
    try {
      if (editing) {
        await adminRequest(`/admin/leaders/${props.leader.id}`, { method: 'PUT', body });
        toast.success('Saved — pages that show this leader refresh in a few seconds');
      } else {
        const made = await adminRequest<AdminLeader>('/admin/leaders', { method: 'POST', body });
        toast.success(`${made.name} added — pick them on a package`);
        release();
        router.push(`/admin/leaders?sel=${encodeURIComponent(made.id)}`);
        router.refresh();
        return;
      }
      release();
      // The panel stays mounted: what was saved is the next edit's clean baseline.
      form.reset(form.getValues());
      router.refresh();
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) {
        let first: keyof LeaderFieldValues | undefined;
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
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', inPanel ? 'min-w-0' : 'max-w-[760px]')}
        noValidate
      >
        <section className={panel}>
          <h3 className={h3}>Photo</h3>
          <FormField
            control={form.control}
            name="photoUrl"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <PhotoUploader
                    value={field.value}
                    onChange={field.onChange}
                    slug={slug}
                    name={name}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className={panel}>
          <h3 className={h3}>Who they are</h3>
          <div className={cn('grid gap-4', !inPanel && 'sm:grid-cols-2')}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} onChange={(e) => onNameChange(e, field.onChange)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SlugField
              name="slug"
              editing={editing}
              locked={false}
              placeholder="tenzin-norbu"
              publicPath="/leaders"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <FormField
              control={form.control}
              name="languages"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Languages</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="English, Hindi, Ladakhi" />
                  </FormControl>
                  <FormDescription>Separate with commas.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="yearsLeading"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Years leading</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={0} max={60} inputMode="numeric" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="regions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Regions</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ladakh, Himachal high passes" />
                </FormControl>
                <FormDescription>Where they lead trips — separate with commas.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className={panel}>
          <h3 className={h3}>What travellers read</h3>
          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bio</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={4} maxLength={300} />
                </FormControl>
                <FormDescription>
                  Two or three lines on the package page · {String(bio ?? '').trim().length}/300
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="funFact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fun fact</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={140} placeholder="Optional" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className={panel}>
          <h3 className={h3}>Phone</h3>
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Phone</FormLabel>
                <FormControl>
                  <Input {...field} type="tel" inputMode="tel" placeholder="+91 98450 12345" />
                </FormControl>
                <FormDescription>
                  Travellers see it only in their trip pack, a week before the trip. You see it on
                  the manifest and the booking.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add leader'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              inPanel ? form.reset() : confirmLeave(() => router.push('/admin/leaders'))
            }
          >
            Cancel
          </Button>
        </div>

        {editing && (
          <section className={panel}>
            <h3 className={h3}>Delete</h3>
            <DeleteLeader
              id={props.leader.id}
              name={props.leader.name}
              deletable={props.leader.deletable}
            />
          </section>
        )}
      </form>
    </Form>
  );
}
