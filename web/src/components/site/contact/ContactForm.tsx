'use client';

import type { FormEvent } from 'react';
import { whatsappHref } from '@/lib/business';
import { contactMessage } from '@/lib/contact';
import { WhatsApp } from '../home/icons';

const field =
  'w-full rounded-btn border-[1.5px] border-line bg-bg px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-mute/70 focus:border-primary';

/**
 * "Send a message" (S9). Until the enquiry flow exists this composes the fields into one
 * WhatsApp message and opens it — a real path to a person today, replaced by the api-backed
 * form later. Without JS the button still opens a blank WhatsApp chat.
 */
export function ContactForm() {
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = contactMessage({
      name: String(data.get('name') ?? ''),
      mobile: String(data.get('mobile') ?? ''),
      email: String(data.get('email') ?? ''),
      message: String(data.get('message') ?? ''),
    });
    window.location.assign(whatsappHref(text));
  }

  return (
    <form
      onSubmit={onSubmit}
      action={whatsappHref('Hi Tripsmith, I want to plan a trip')}
      method="get"
      className="grid gap-4 rounded-card border border-line p-6"
    >
      <h2 className="text-xl">Send a message</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          Your name
          <input name="name" className={field} placeholder="Name" autoComplete="name" required />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Mobile
          <input
            name="mobile"
            className={`num ${field}`}
            placeholder="10-digit mobile"
            inputMode="tel"
            autoComplete="tel"
            pattern="[0-9+ ]{10,15}"
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-semibold">
        Email
        <input
          name="email"
          type="email"
          className={field}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        What are you looking for?
        <textarea
          name="message"
          rows={5}
          className={field}
          placeholder="Where, when, how many of you, rough budget…"
          required
        />
      </label>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-btn bg-wa px-5 py-3 font-bold text-white shadow-[0_8px_20px_-10px_rgb(37_211_102/0.7)] transition-[filter] hover:brightness-105"
      >
        <WhatsApp className="size-5" />
        Send on WhatsApp
      </button>
      <p className="text-[13px] text-mute">
        Opens WhatsApp with your message filled in — nothing is stored on this site. We reply within
        two hours in office hours.
      </p>
    </form>
  );
}
