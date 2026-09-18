import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { WhatsApp } from '@/components/site/home/icons';
import { Check } from '@/components/site/package/icons';
import { api } from '@/lib/api';
import { BUSINESS, whatsappHref } from '@/lib/business';

type Search = Record<string, string | string[] | undefined>;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Thanks — we’ll call you',
  robots: { index: false, follow: false },
};

const REF_RE = /^TS-[A-Z2-9]{6}$/;

async function packageName(slug: string | undefined): Promise<string | undefined> {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  try {
    return (
      await api('/packages/{slug}', {
        params: { slug },
        tags: [`package:${slug}`],
        revalidate: 3600,
      })
    ).name;
  } catch {
    return undefined;
  }
}

const STEPS: [string, string][] = [
  ['We call you', `From ${BUSINESS.phoneDisplay} — save the number so you know it is us.`],
  ['We confirm the details', 'Dates, room type, flights if you want them.'],
  ['You decide', 'No payment until you say so.'],
];

/** S7. Everything it shows comes from the URL the form sent it to; a bad ref shows a neutral page. */
export default async function ThanksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const ref = REF_RE.test(one('ref') ?? '') ? one('ref') : undefined;
  const first = (one('name') ?? '').trim().slice(0, 40);
  const pkgSlug = one('package');
  const pkgName = await packageName(pkgSlug);
  const emailed = one('emailed') === '1';
  const wa = whatsappHref(
    `Hi Tripsmith, this is ${first || 'a visitor'}${pkgName ? ` about ${pkgName}` : ''}${ref ? ` (enquiry ${ref})` : ''}.`,
  );

  return (
    <Container className="grid max-w-[640px] justify-items-center gap-3.5 py-16 text-center">
      <span aria-hidden className="grid size-18 place-items-center rounded-full bg-ok-soft text-ok">
        <Check className="size-8" />
      </span>
      <h1 className="text-[clamp(28px,3.4vw,36px)]">
        Thanks{first ? `, ${first}` : ''} — we’ll call you within 2 hours.
      </h1>
      {ref && (
        <>
          <p className="text-mute">Your enquiry reference is</p>
          <span className="num rounded-btn bg-bg2 px-3.5 py-2 font-extrabold tracking-wide">
            {ref}
          </span>
        </>
      )}
      <p className="text-mute">
        {pkgName ? `We have your enquiry about ${pkgName}. ` : ''}Our office hours are{' '}
        {BUSINESS.hours}; if it is later than that, we call first thing tomorrow.
      </p>
      {emailed && (
        <p className="text-mute">
          We’ve also emailed this to you — check spam if it isn’t there in a minute.
        </p>
      )}
      <ol className="mt-3 grid w-full gap-3 text-left sm:grid-cols-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="rounded-[14px] border border-line p-4">
            <b className="block">
              {i + 1} · {title}
            </b>
            <span className="text-sm text-mute">{text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <a
          href={wa}
          className="inline-flex items-center gap-2 rounded-btn bg-wa px-5 py-3 font-bold text-white no-underline shadow-[0_8px_20px_-10px_rgb(37_211_102/0.7)] hover:brightness-105"
        >
          <WhatsApp className="size-5" />
          Chat on WhatsApp
        </a>
        {pkgSlug && pkgName && (
          <Link
            href={`/packages/${pkgSlug}`}
            className="rounded-btn border border-line px-5 py-3 font-bold text-ink no-underline hover:border-ink"
          >
            Back to {pkgName}
          </Link>
        )}
        <Link
          href="/packages"
          className="rounded-btn border border-line px-5 py-3 font-bold text-ink no-underline hover:border-ink"
        >
          Browse more trips
        </Link>
      </div>
    </Container>
  );
}
