'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { NativeCheckbox } from '@/components/admin/NativeCheckbox';
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
import { adminRequest } from '@/lib/admin/client';
import {
  type AdminCoupon,
  type CouponFormFields,
  type CouponFormValues,
  couponSchema,
  fromCoupon,
  SERVER_FIELD,
  toInput,
} from '@/lib/admin/coupon-schema';
import { reportAdminError } from '@/lib/admin/errors';
import { useConfirmLeave, useUnsavedChangesGuard } from '@/lib/admin/unsaved';
import { ApiRequestError } from '@/lib/api-errors';
import { DeleteCoupon } from './DeleteCoupon';

type PackageOption = { id: string; name: string };
type Props = { packages: PackageOption[]; today: string } & (
  { mode: 'create' } | { mode: 'edit'; coupon: AdminCoupon }
);

const panel = 'grid gap-4 rounded-card border border-line bg-bg p-5';
const h3 = 'text-base font-extrabold';

/**
 * Create / edit a coupon (R26, B15), on the DestinationForm pattern: zod on the client, the
 * api's 400/409 `fieldErrors` pinned under their inputs. Once the coupon is in use its code,
 * kind and amount are read-only (the api refuses them too) and it can only be paused.
 */
export function CouponForm(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const editing = props.mode === 'edit';
  const locked = editing && props.coupon.locked;
  const form = useForm<CouponFormFields, unknown, CouponFormValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: editing
      ? fromCoupon(props.coupon)
      : {
          code: '',
          kind: 'percent',
          amount: '',
          percent: '',
          cap: '',
          min: '',
          startsOn: props.today,
          endsOn: '',
          useLimit: '',
          allPackages: true,
          packageIds: [],
          active: true,
        },
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const allPackages = useWatch({ control: form.control, name: 'allPackages' });
  const confirmLeave = useConfirmLeave();
  const { release } = useUnsavedChangesGuard(form.formState.isDirty);

  async function onSubmit(values: CouponFormValues) {
    const body = toInput(values);
    try {
      if (editing) {
        await adminRequest(`/admin/coupons/${props.coupon.id}`, { method: 'PUT', body });
        toast.success(`${body.code} saved`);
      } else {
        await adminRequest('/admin/coupons', { method: 'POST', body });
        toast.success(`${body.code} created — customers can use it from ${body.startsOn}`);
      }
      release();
      router.push('/admin/coupons');
      router.refresh();
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) {
        let first: keyof CouponFormFields | undefined;
        for (const [field, message] of Object.entries(e.body.fieldErrors)) {
          const name = SERVER_FIELD[field];
          if (!name) continue;
          form.setError(name, { type: 'server', message });
          first ??= name;
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
  const lockNote = locked ? (
    <FormDescription className="flex items-center gap-1">
      <Lock className="size-3" aria-hidden /> Locked — the coupon is in use
    </FormDescription>
  ) : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-[860px] gap-4" noValidate>
        <section className={panel}>
          <h3 className={h3}>Code and discount</h3>
          {locked && (
            <p className="rounded-[10px] bg-bg2 px-3 py-2 text-[13px] text-ink2">
              Used {props.coupon.uses} {props.coupon.uses === 1 ? 'time' : 'times'}
              {props.coupon.liveHolds ? ` · ${props.coupon.liveHolds} checkout holding it now` : ''}
              . Vouchers already carry this code and discount, so those stay as they are — dates,
              limits and packages can still change.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={locked}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={20}
                      placeholder="DIWALI10"
                      className="font-mono tracking-wide uppercase"
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  {lockNote ?? <FormDescription>Customers type it in any case.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <div role="radiogroup" aria-label="Type" className="flex gap-2">
                    {(
                      [
                        ['percent', '% off'],
                        ['flat', '₹ off'],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-btn border px-3 py-2 text-sm font-bold has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${field.value === value ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line'}`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={field.name}
                          value={value}
                          checked={field.value === value}
                          disabled={locked}
                          onChange={() => field.onChange(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {kind === 'flat' ? (
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem className="sm:max-w-[50%]">
                  <FormLabel>₹ off the booking</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" disabled={locked} placeholder="500" />
                  </FormControl>
                  {lockNote ?? (
                    <FormDescription>Once per booking, whatever the party size.</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="percent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>% off</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" disabled={locked} placeholder="10" />
                    </FormControl>
                    {lockNote ?? (
                      <FormDescription>
                        Of the total after any deal, rounded down to the rupee.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Up to ₹ (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" placeholder="1000" />
                    </FormControl>
                    <FormDescription>Blank = no cap.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </section>

        <section className={panel}>
          <h3 className={h3}>When and how often</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="startsOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starts on</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endsOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last day (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" min={form.getValues('startsOn')} />
                  </FormControl>
                  <FormDescription>Works until midnight IST. Blank = no end.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="min"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum booking ₹ (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="20000" />
                  </FormControl>
                  <FormDescription>The total after any deal.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="useLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total uses (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" placeholder="100" />
                  </FormControl>
                  <FormDescription>
                    A use counts once the payment is captured. Each email can use it once.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className={panel}>
          <h3 className={h3}>Trips</h3>
          <FormField
            control={form.control}
            name="allPackages"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2.5">
                <FormControl>
                  <NativeCheckbox
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                </FormControl>
                <FormLabel className="font-semibold">Every package</FormLabel>
              </FormItem>
            )}
          />
          {!allPackages && (
            <FormField
              control={form.control}
              name="packageIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Only these packages</FormLabel>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {props.packages.map((p) => (
                      <label key={p.id} className="flex items-center gap-2.5 text-sm">
                        <NativeCheckbox
                          checked={field.value.includes(p.id)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.checked
                                ? [...field.value, p.id]
                                : field.value.filter((id) => id !== p.id),
                            )
                          }
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="active"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2.5 border-t border-line pt-4">
                <FormControl>
                  <NativeCheckbox
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                </FormControl>
                <FormLabel className="font-semibold">
                  On — customers can use it (off = paused)
                </FormLabel>
              </FormItem>
            )}
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save coupon' : 'Create coupon'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => confirmLeave(() => router.push('/admin/coupons'))}
          >
            Cancel
          </Button>
          {editing && (
            <span className="sm:ml-auto">
              <DeleteCoupon id={props.coupon.id} code={props.coupon.code} locked={locked} />
            </span>
          )}
        </div>
      </form>
    </Form>
  );
}
