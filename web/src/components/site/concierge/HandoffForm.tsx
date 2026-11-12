'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { control, Field } from '@/components/site/enquiry/Field';
import { errorFromResponse } from '@/lib/api-errors';
import type { HandoffPrefill } from '@/lib/concierge/types';
import type { EnquiryCreated } from '@/lib/enquiry-forward';
import {
  enquirySchema,
  fieldErrorsOf,
  MESSAGE_MAX,
  NAME_MAX,
  TRAVELLERS,
  travelMonthOptions,
} from '@/lib/enquiry-schema';

const FAILED = 'Something went wrong on our side. Please try again, or WhatsApp us.';
const LIMITED = 'Too many enquiries from this connection — try again in a few minutes.';

/** Field ids are prefixed: the panel can open over /contact, whose own form uses the plain names. */
const ID = (name: string) => `handoff-${name}`;

/**
 * "Talk to a person" (v3 C3, R29): the enquiry form, inside the panel. The concierge's
 * `createEnquiry` opens it pre-filled with its summary, the trip and the party; name, phone and
 * email are typed here and go straight to the api — never into the chat, never to the model.
 * Posted as `chat-handoff` with the conversation id, so the owner reads the transcript with it
 * and the customer gets the standard confirmation email.
 */
export function HandoffForm({
  prefill,
  conversationId,
  onClose,
  onSent,
}: {
  prefill: HandoffPrefill;
  conversationId: string | null;
  onClose: () => void;
  onSent: (created: EnquiryCreated) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const months = travelMonthOptions();

  useEffect(() => {
    form.current?.querySelector<HTMLElement>(`#${ID('name')}`)?.focus();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const raw: Record<string, string> = { type: 'chat-handoff' };
    for (const [k, v] of data.entries()) if (typeof v === 'string') raw[k] = v;
    if (prefill.package) raw.packageSlug = prefill.package.slug;
    if (conversationId) raw.conversationId = conversationId;
    const parsed = enquirySchema.safeParse(raw);
    if (!parsed.success) {
      const next = fieldErrorsOf(parsed.error);
      setErrors(next);
      const first = Object.keys(next)[0];
      if (first) form.current?.querySelector<HTMLElement>(`#${ID(first)}`)?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 201) {
        onSent((await res.json()) as EnquiryCreated);
        return;
      }
      const err = errorFromResponse(
        res.status,
        res.statusText,
        await res.json().catch(() => undefined),
      );
      if (err.body.code === 'validation' && err.body.fieldErrors) {
        const { conversationId: gone, ...rest } = err.body.fieldErrors;
        setErrors(rest);
        if (gone) setBanner(gone);
      } else setBanner(err.body.code === 'rate_limited' ? LIMITED : FAILED);
    } catch {
      setBanner(FAILED);
    }
    setBusy(false);
  }

  const describe = (name: string) => ({
    id: ID(name),
    name,
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `${ID(name)}-error` : undefined,
  });

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      aria-labelledby="handoff-title"
      className="grid gap-3.5 rounded-card border border-line bg-bg p-4"
    >
      <div className="flex items-start gap-2">
        <div className="grid gap-0.5">
          <h3 id="handoff-title" className="text-[16px] font-extrabold text-ink">
            Talk to a person
          </h3>
          <p className="text-[13px] text-mute">
            {prefill.package ? `About ${prefill.package.name}. ` : ''}
            Our team will get back to you. Your details go to them only — not into the chat.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 rounded-[9px] px-2 py-1 text-[13px] font-bold text-mute hover:bg-bg2 hover:text-ink"
        >
          Back to chat
        </button>
      </div>
      {banner && (
        <p
          role="alert"
          className="rounded-btn bg-warn-soft px-3 py-2 text-[13.5px] font-semibold text-warn"
        >
          {banner}
        </p>
      )}
      <Field label="Your name" name={ID('name')} error={errors.name}>
        <input {...describe('name')} autoComplete="name" maxLength={NAME_MAX} className={control} />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Mobile number" name={ID('phone')} error={errors.phone}>
          <input
            {...describe('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={control}
          />
        </Field>
        <Field label="Email" name={ID('email')} error={errors.email}>
          <input
            {...describe('email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            className={control}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Field label="Adults" name={ID('adults')} error={errors.adults}>
          <select
            {...describe('adults')}
            defaultValue={String(prefill.adults ?? 2)}
            className={control}
          >
            {TRAVELLERS.adults.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Children" name={ID('children')} error={errors.children}>
          <select
            {...describe('children')}
            defaultValue={String(prefill.children ?? 0)}
            className={control}
          >
            {TRAVELLERS.children.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Month" name={ID('travelMonth')} error={errors.travelMonth}>
          <select
            {...describe('travelMonth')}
            defaultValue={prefill.month ?? ''}
            className={control}
          >
            <option value="">Not sure</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="What you’re looking for" name={ID('message')} error={errors.message}>
        <textarea
          {...describe('message')}
          rows={3}
          maxLength={MESSAGE_MAX}
          defaultValue={prefill.summary}
          className={`${control} field-sizing-content min-h-20`}
        />
      </Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" hidden aria-hidden />
      <button
        type="submit"
        disabled={busy}
        className="rounded-btn bg-primary px-4 py-3 font-bold text-white hover:bg-primary-ink disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send to the team'}
      </button>
      {conversationId && (
        <p className="text-[12px] text-mute">
          This chat goes with your enquiry, so you won’t have to repeat yourself.
        </p>
      )}
    </form>
  );
}
