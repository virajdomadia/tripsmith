'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { DemoNotice } from '@/components/site/DemoNotice';
import { errorFromResponse } from '@/lib/api-errors';
import { BUSINESS, whatsappHref, whatsappInterest } from '@/lib/business';
import {
  BUDGET,
  BUDGET_MESSAGE,
  enquiryFromForm,
  enquirySchema,
  fieldErrorsOf,
  MESSAGE_MAX,
  NAME_MAX,
  TRAVELLERS,
} from '@/lib/enquiry-schema';
import { type ServerError, thanksHref } from '@/lib/enquiry-form-state';
import type { EnquiryCreated } from '@/lib/enquiry-forward';
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
 * visitor is taken to the thanks page. `kind="package"` shows the Standard / Customise toggle —
 * native radios, so arrow keys and the posted `type` come for free.
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
  // Bumped when a submit fails validation (and set on a no-JS round trip that came back with
  // errors): the effect below then moves focus to the first invalid control.
  const [focusRequest, setFocusRequest] = useState(Object.keys(fieldErrors).length > 0 ? 1 : 0);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerId = useId();
  const type = kind === 'contact' ? 'contact' : mode;
  const d = defaultValues;

  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-error]')
      ?.focus();
  }, [focusRequest]);

  const showErrors = (next: Record<string, string>) => {
    setErrors(next);
    setFocusRequest((n) => n + 1);
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = enquiryFromForm(new FormData(e.currentTarget));
    const parsed = enquirySchema.safeParse(raw);
    if (!parsed.success) {
      showErrors(fieldErrorsOf(parsed.error));
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
        const body = (await res.json()) as EnquiryCreated;
        router.push(
          thanksHref({
            ref: body.ref,
            firstName: body.firstName,
            packageSlug: body.package?.slug,
            emailed: body.emailed,
          }),
        );
        // Stay busy: the button must not come back to life while the thanks page loads.
        return;
      }
      const err = errorFromResponse(
        res.status,
        res.statusText,
        await res.json().catch(() => undefined),
      );
      if (err.body.code === 'validation' && err.body.fieldErrors) showErrors(err.body.fieldErrors);
      else setBanner(err.body.code === 'rate_limited' ? MESSAGES.rate_limited : MESSAGES.internal);
    } catch {
      setBanner(MESSAGES.internal);
    }
    setBusy(false);
  }

  /** `aria-invalid` + the error, or the hint when the field has one (Field renders both ids). */
  const describe = (name: string, hint = false) => ({
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined,
  });

  return (
    <form
      ref={formRef}
      action="/enquire"
      method="post"
      onSubmit={onSubmit}
      noValidate
      aria-describedby={banner ? bannerId : undefined}
      className="relative grid gap-4 rounded-card border border-line p-6"
    >
      {kind === 'contact' && <input type="hidden" name="type" value="contact" />}
      {pkg && <input type="hidden" name="packageSlug" value={pkg.slug} />}

      {kind === 'package' && (
        <fieldset className="m-0 flex min-w-0 rounded-[12px] border-0 bg-bg2 p-1">
          <legend className="sr-only">Enquiry type</legend>
          {(['standard', 'custom'] as const).map((m) => (
            <label key={m} className="flex-1">
              <input
                type="radio"
                name="type"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="peer sr-only"
              />
              <span
                className={`block cursor-pointer rounded-[9px] px-3 py-2.5 text-center text-sm font-bold transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
                  mode === m
                    ? 'bg-bg text-ink shadow-[0_1px_3px_rgb(0_0_0/0.08)]'
                    : 'text-mute hover:text-ink'
                }`}
              >
                {m === 'standard' ? 'Standard trip' : 'Customise this trip'}
              </span>
            </label>
          ))}
        </fieldset>
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
              pkg ? `Hi Tripsmith, I'm interested in ${pkg.name}` : whatsappInterest(),
            )}
            className="underline"
          >
            WhatsApp us
          </a>
        </p>
      )}

      {errors.packageSlug && (
        <p
          data-form-error
          tabIndex={-1}
          className="rounded-btn border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn"
        >
          {errors.packageSlug} —{' '}
          <Link href="/packages" className="underline">
            browse the trips we run
          </Link>
          .
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
            maxLength={NAME_MAX}
            className={control}
            {...describe('name')}
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
            {...describe('phone', true)}
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
            {...describe('email')}
          />
        </Field>
        <Field label="Travel month" name="travelMonth" error={errors.travelMonth}>
          <select
            id="travelMonth"
            name="travelMonth"
            defaultValue={d.travelMonth ?? ''}
            className={control}
            {...describe('travelMonth')}
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
            {...describe('adults')}
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
            {...describe('children')}
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
              {...describe('preferredDates', true)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Budget per person (₹)"
              name="budget"
              error={errors.budget}
              hint={BUDGET_MESSAGE}
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
                {...describe('budget', true)}
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
              {...describe('changes')}
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
          {...describe('message')}
        />
      </Field>

      {/* Honeypot: off-screen, unlabeled for AT, skipped by the tab order. Bots fill it; people never see it. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <DemoNotice />
      <button
        type="submit"
        disabled={busy}
        className="rounded-btn bg-action px-5 py-3 font-bold text-ink transition-colors hover:bg-action-ink disabled:opacity-60"
      >
        {busy ? 'Sending…' : kind === 'contact' ? 'Send message' : 'Send enquiry'}
      </button>
      <p className="text-[13px] text-mute">
        By sending, you agree to our <Link href="/privacy">privacy policy</Link>. A person calls you
        back within 2 hours, {BUSINESS.hours}.
      </p>
    </form>
  );
}
