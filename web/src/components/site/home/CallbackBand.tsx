import { BUSINESS, whatsappHref, whatsappInterest } from '@/lib/business';
import { Phone, WhatsApp } from './icons';

/** Ocean-gradient band: WhatsApp + phone. The callback form joins it with the enquiry flow (F9). */
export function CallbackBand() {
  return (
    <section className="mt-18 grid items-center gap-8 rounded-[22px] bg-[linear-gradient(120deg,var(--color-primary-ink),var(--color-primary))] p-8 text-white md:grid-cols-[1.2fr_1fr] md:p-11">
      <div>
        <h2 className="text-[clamp(26px,3vw,36px)]">
          Not sure where to go? Talk to a travel expert.
        </h2>
        <p className="mt-3 max-w-[52ch] opacity-90">
          Tell us your dates and budget. A person from our Bengaluru office calls you back within
          two hours, {BUSINESS.hours}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5 md:justify-end">
        <a
          href={whatsappHref(whatsappInterest())}
          className="inline-flex items-center gap-2 rounded-btn bg-wa px-5 py-3 font-bold text-white no-underline shadow-[0_8px_20px_-10px_rgb(37_211_102/0.7)] transition-[filter] hover:brightness-105"
        >
          <WhatsApp className="size-5" />
          WhatsApp us
        </a>
        <a
          href={BUSINESS.phoneHref}
          className="num inline-flex items-center gap-2 rounded-btn border border-white/40 px-5 py-3 font-bold text-white no-underline transition-colors hover:bg-white/10"
        >
          <Phone className="size-5" />
          {BUSINESS.phoneDisplay}
        </a>
      </div>
    </section>
  );
}
