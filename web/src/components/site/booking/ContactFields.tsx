'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { normaliseGstin, STATE_NAMES } from '@/lib/gst';
import { control, Field } from '../enquiry/Field';
import type { BookingFlow } from './use-booking';

/**
 * Step 4 (B0 contact): who we reach about the booking; prefilled into Razorpay Checkout. P13b
 * adds the State (the invoice's place of supply) and, behind a toggle, a business GSTIN with its
 * company name for a B2B tax invoice.
 */
export function ContactFields({ flow }: { flow: BookingFlow }) {
  const { contact, errors } = flow;
  const [business, setBusiness] = useState(Boolean(contact.gstin));
  const describe = (name: string) => ({
    id: name,
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  function toggleBusiness() {
    if (business) flow.updateContact({ gstin: '', companyName: '' });
    setBusiness(!business);
  }
  return (
    <div className="grid gap-3">
      <Field label="Lead traveller" name="contact.name" error={errors['contact.name']}>
        <input
          {...describe('contact.name')}
          className={control}
          autoComplete="name"
          maxLength={80}
          value={contact.name}
          onChange={(e) => flow.updateContact({ name: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mobile" name="contact.phone" error={errors['contact.phone']}>
          <input
            {...describe('contact.phone')}
            className={control}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98450 12345"
            value={contact.phone}
            onChange={(e) => flow.updateContact({ phone: e.target.value })}
          />
        </Field>
        <Field label="Email" name="contact.email" error={errors['contact.email']}>
          <input
            {...describe('contact.email')}
            className={control}
            type="email"
            autoComplete="email"
            maxLength={120}
            value={contact.email}
            onChange={(e) => flow.updateContact({ email: e.target.value })}
          />
        </Field>
      </div>
      <Field
        label="State"
        name="contact.state"
        error={errors['contact.state']}
        hint="For the GST invoice: Karnataka pays CGST + SGST, other States IGST."
      >
        <div className="relative">
          <select
            {...describe('contact.state')}
            aria-describedby={
              errors['contact.state'] ? 'contact.state-error' : 'contact.state-hint'
            }
            className={`${control} appearance-none pr-9`}
            autoComplete="address-level1"
            value={contact.state}
            onChange={(e) => flow.updateContact({ state: e.target.value })}
          >
            <option value="">Choose your State</option>
            {STATE_NAMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-mute"
            aria-hidden
          />
        </div>
      </Field>
      <button
        type="button"
        aria-expanded={business}
        aria-controls="contact-business"
        onClick={toggleBusiness}
        className="justify-self-start text-sm font-bold text-primary underline-offset-4 hover:underline"
      >
        {business ? 'Remove business GST details' : 'Booking for a business? Add your GSTIN'}
      </button>
      <div id="contact-business" hidden={!business} className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Company GSTIN"
          name="contact.gstin"
          error={errors['contact.gstin']}
          hint="15 characters; the first two are your State’s code."
        >
          <input
            {...describe('contact.gstin')}
            aria-describedby={
              errors['contact.gstin'] ? 'contact.gstin-error' : 'contact.gstin-hint'
            }
            className={`${control} num uppercase`}
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="29ABCDE1234F1Z5"
            value={contact.gstin}
            // Pasted with spaces ("29 ABCDE 1234F1Z5") still fits: spaces go before the cap.
            onChange={(e) =>
              flow.updateContact({ gstin: normaliseGstin(e.target.value).slice(0, 15) })
            }
          />
        </Field>
        <Field
          label="Company name"
          name="contact.companyName"
          error={errors['contact.companyName']}
        >
          <input
            {...describe('contact.companyName')}
            className={control}
            autoComplete="organization"
            maxLength={100}
            value={contact.companyName}
            onChange={(e) => flow.updateContact({ companyName: e.target.value })}
          />
        </Field>
      </div>
      <p className="text-[12.5px] text-mute">
        We use these only to reach you about this booking and for its GST invoice. Checkout is
        prefilled with them.
      </p>
    </div>
  );
}
