'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { errorFromResponse } from '@/lib/api-errors';
import { BUSINESS, whatsappHref } from '@/lib/business';
import {
  BUDGET,
  enquiryFromForm,
  enquirySchema,
  fieldErrorsOf,
  MESSAGE_MAX,
  TRAVELLERS,
} from '@/lib/enquiry-schema';
import { type ServerError, thanksHref } from '@/lib/enquiry-form-state';
import { control, Field } from './Field';

export type EnquiryKind = 'package' | 'contact';
export type Mode = 'standard' | 'custom';

export type EnquiryFormProps = {
  kind: EnquiryKind;
  pkg?: { slug: string; name: string };
  months: { value: string; label: string }[];
  /** Re-fill after a no-JS round trip (raw strings from the proxy's redirect). */
  defaultValues?: Record<string, string>;
  fieldErrors?: Record<string, string>;
  error?: ServerError;
};

const MESSAGES: Record<ServerError, string> = {
  rate_limited:
    'Too many enquiries from this connection — try again in a few minutes, or WhatsApp us.',
  internal: 'Something went wrong on our side. Please try again, or call us.',
};

/**
 * S6. A native form (`action="/enquire"`) so it works without JavaScript; with it, the submit is
 * intercepted, validated by the zod mirror, posted to the api through the `/api` rewrite and the
 * visitor is taken to the thanks page. `kind="package"` shows the Standard / Customise toggle.
 */
export function EnquiryForm({
  kind,
  pkg,
  months,
  defaultValues = {},
  fieldErrors = {},
  error,
}: EnquiryFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultValues.type === 'custom' ? 'custom' : 'standard');
  const [errors, setErrors] = useState<Record<string, string>>(fieldErrors);
  const [banner, setBanner] = useState<string | undefined>(error && MESSAGES[error]);
  const [busy, setBusy] = useState(false);
  const bannerId = useId();
  const type = kind === 'contact' ? 'contact' : mode;
  const d = defaultValues;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = enquiryFromForm(new FormData(e.currentTarget));
    const parsed = enquirySchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setErrors({});
    setBanner(undefined);
    setBusy(true);
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 201) {
        const body = (await res.json()) as {
          ref: string;
          firstName: string;
          package: { slug: string } | null;
        };
        router.push(
          thanksHref({ ref: body.ref, firstName: body.firstName, packageSlug: body.package?.slug }),
        );
        return;
      }
      const err = errorFromResponse(
        res.status,
        res.statusText,
        await res.json().catch(() => undefined),
      );
      if (err.body.code === 'validation' && err.body.fieldErrors) setErrors(err.body.fieldErrors);
      else setBanner(err.body.code === 'rate_limited' ? MESSAGES.rate_limited : MESSAGES.internal);
    } catch {
      setBanner(MESSAGES.internal);
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name: string) =>
    errors[name] ? { 'aria-invalid': true as const, 'aria-describedby': `${name}-error` } : {};

  return (
    <form
      action="/enquire"
      method="post"
      onSubmit={onSubmit}
      noValidate
      aria-describedby={banner ? bannerId : undefined}
      className="relative grid gap-4 rounded-card border border-line p-6"
    >
      <input type="hidden" name="type" value={type} />
      {pkg && <input type="hidden" name="packageSlug" value={pkg.slug} />}

      {kind === 'package' && (
        <div role="tablist" aria-label="Enquiry type" className="flex rounded-[12px] bg-bg2 p-1">
          {(['standard', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-[9px] px-3 py-2.5 text-sm font-bold transition-colors ${
                mode === m
                  ? 'bg-bg text-ink shadow-[0_1px_3px_rgb(0_0_0/0.08)]'
                  : 'text-mute hover:text-ink'
              }`}
            >
              {m === 'standard' ? 'Standard trip' : 'Customise this trip'}
            </button>
          ))}
        </div>
      )}

      {banner && (
        <p
          id={bannerId}
          role="alert"
          className="rounded-btn border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn"
        >
          {banner}{' '}
          <a
            href={whatsappHref(
              pkg
                ? `Hi Tripsmith, I'm interested in ${pkg.name}`
                : 'Hi Tripsmith, I want to plan a trip',
            )}
            className="underline"
          >
            WhatsApp us
          </a>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" error={errors.name}>
          <input
            id="name"
            name="name"
            defaultValue={d.name}
            autoComplete="name"
            required
            className={control}
            {...invalid('name')}
          />
        </Field>
        <Field label="Mobile number" name="phone" error={errors.phone} hint="We call this number">
          <input
            id="phone"
            name="phone"
            defaultValue={d.phone}
            inputMode="tel"
            autoComplete="tel"
            required
            className={`num ${control}`}
            {...invalid('phone')}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={d.email}
            autoComplete="email"
            required
            className={control}
            {...invalid('email')}
          />
        </Field>
        <Field label="Travel month" name="travelMonth" error={errors.travelMonth}>
          <select
            id="travelMonth"
            name="travelMonth"
            defaultValue={d.travelMonth ?? ''}
            className={control}
            {...invalid('travelMonth')}
          >
            <option value="">Not sure yet</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Adults" name="adults" error={errors.adults}>
          <select
            id="adults"
            name="adults"
            defaultValue={d.adults ?? '2'}
            className={control}
            {...invalid('adults')}
          >
            {TRAVELLERS.adults.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Children (5–11)" name="children" error={errors.children}>
          <select
            id="children"
            name="children"
            defaultValue={d.children ?? '0'}
            className={control}
            {...invalid('children')}
          >
            {TRAVELLERS.children.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {type === 'custom' && (
        <>
          <Field
            label="Preferred dates"
            name="preferredDates"
            error={errors.preferredDates}
            hint="Rough is fine — “second week of December”"
          >
            <input
              id="preferredDates"
              name="preferredDates"
              defaultValue={d.preferredDates}
              maxLength={200}
              className={control}
              {...invalid('preferredDates')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Budget per person (₹)"
              name="budget"
              error={errors.budget}
              hint={`Between ₹${BUDGET.min.toLocaleString('en-IN')} and ₹${BUDGET.max.toLocaleString('en-IN')}`}
            >
              <input
                id="budget"
                name="budget"
                type="number"
                inputMode="numeric"
                min={BUDGET.min}
                max={BUDGET.max}
                step={500}
                defaultValue={d.budget}
                className={`num ${control}`}
                {...invalid('budget')}
              />
            </Field>
          </div>
          <Field label="What would you change?" name="changes" error={errors.changes}>
            <textarea
              id="changes"
              name="changes"
              rows={3}
              defaultValue={d.changes}
              maxLength={MESSAGE_MAX}
              placeholder="A different hotel, an extra night, skip the coach…"
              className={control}
              {...invalid('changes')}
            />
          </Field>
        </>
      )}

      <Field
        label={kind === 'contact' ? 'What are you looking for?' : 'Anything we should know?'}
        name="message"
        error={errors.message}
      >
        <textarea
          id="message"
          name="message"
          rows={4}
          defaultValue={d.message}
          maxLength={MESSAGE_MAX}
          placeholder={
            kind === 'contact'
              ? 'Where, when, how many of you, rough budget…'
              : 'Dates you are looking at, flights, anything special…'
          }
          className={control}
          {...invalid('message')}
        />
      </Field>

      {/* Honeypot: off-screen, unlabeled for AT, skipped by the tab order. Bots fill it; people never see it. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-btn bg-action px-5 py-3 font-bold text-ink transition-colors hover:bg-action-ink disabled:opacity-60"
      >
        {busy ? 'Sending…' : kind === 'contact' ? 'Send message' : 'Send enquiry'}
      </button>
      <p className="text-[13px] text-mute">
        By sending, you agree to our <Link href="/privacy">privacy policy</Link>. We never share
        your number. A person calls you back within 2 hours, {BUSINESS.hours}.
      </p>
    </form>
  );
}
