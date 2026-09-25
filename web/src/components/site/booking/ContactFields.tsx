'use client';

import { control, Field } from '../enquiry/Field';
import type { BookingFlow } from './use-booking';

/** Step 4 (B0 contact): who we reach about the booking; prefilled into Razorpay Checkout. */
export function ContactFields({ flow }: { flow: BookingFlow }) {
  const { contact, errors } = flow;
  const describe = (name: string) => ({
    id: name,
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
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
      <p className="text-[12.5px] text-mute">
        We use these only to reach you about this booking. Checkout is prefilled with them.
      </p>
    </div>
  );
}
