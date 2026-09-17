import Image from 'next/image';
import Link from 'next/link';
import type { components } from '@/lib/api-types';

type Stats = components['schemas']['HomeStats'];

/** S1 about band: two framed photos with a postmark, the story, four facts (two of them live). */
export function AboutBand({ stats }: { stats: Stats }) {
  const facts = [
    [String(stats.packages), 'trips we run'],
    [String(stats.destinations), 'destinations we know'],
    ['2 h', 'callback promise'],
    ['2019', 'first departure'],
  ];
  return (
    <section className="mt-18 grid items-center gap-11 md:grid-cols-[1fr_1.1fr]">
      <div className="relative mx-6 my-8 md:mx-0">
        <div className="relative aspect-[4/3] -rotate-[1.5deg] overflow-hidden rounded-[4px] border-[10px] border-bg shadow-[0_30px_60px_-30px_rgb(20_32_42/0.5)]">
          <Image
            src="/home/about-1.jpg"
            alt="Tea gardens under cloud at Munnar"
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute -right-6 -bottom-8 aspect-square w-[42%] rotate-[4deg] overflow-hidden rounded-[4px] border-8 border-bg shadow-[0_20px_40px_-20px_rgb(20_32_42/0.5)]">
          <Image
            src="/home/about-2.jpg"
            alt="The Ridge at Shimla"
            fill
            sizes="(min-width: 768px) 20vw, 42vw"
            className="object-cover"
          />
        </div>
        <div
          aria-hidden
          className="absolute -top-5 -left-5 grid size-27 -rotate-[10deg] place-items-center rounded-full border-2 border-dashed border-action-ink bg-bg/90 text-center text-[9px] leading-[1.2] font-bold tracking-[0.14em] text-action-ink uppercase"
        >
          <span>
            Tripsmith
            <b className="block text-[22px] tracking-tight normal-case">2026</b>
            Bengaluru · India
          </span>
        </div>
      </div>
      <div>
        <h2 className="text-[clamp(26px,3.2vw,38px)]">A small team that has actually been.</h2>
        <p className="mt-3 max-w-[52ch] text-base text-mute">
          Tripsmith is four people in Bengaluru who plan short Indian holidays the way we would for
          our own families — the same hotels we have slept in, departures we run ourselves, and a
          phone that gets answered.
        </p>
        <dl className="mt-5.5 flex flex-wrap gap-6">
          {facts.map(([num, label]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-sm font-semibold text-mute">{label}</dt>
              <dd className="num text-[26px] font-extrabold tracking-tight">{num}</dd>
            </div>
          ))}
        </dl>
        <Link
          href="/about"
          className="mt-5.5 inline-block rounded-btn bg-primary px-5 py-3 font-bold text-white no-underline transition-colors hover:bg-primary-ink"
        >
          About Tripsmith
        </Link>
      </div>
    </section>
  );
}
