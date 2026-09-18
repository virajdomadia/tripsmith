import Image from 'next/image';

type Pic = { src: string; alt: string };
type Stamp = { top: string; big: string; bottom: string };

/** The K motif: a tilted framed photo, a smaller inset, a dashed postmark (S1 about band, S8). */
export function FramedPhotos({ main, inset, stamp }: { main: Pic; inset: Pic; stamp: Stamp }) {
  return (
    <div className="relative mx-6 my-8 md:mx-0">
      <div className="relative aspect-[4/3] -rotate-[1.5deg] overflow-hidden rounded-[4px] border-[10px] border-bg shadow-[0_30px_60px_-30px_rgb(20_32_42/0.5)]">
        <Image
          src={main.src}
          alt={main.alt}
          fill
          sizes="(min-width: 768px) 45vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="absolute -right-6 -bottom-8 aspect-square w-[42%] rotate-[4deg] overflow-hidden rounded-[4px] border-8 border-bg shadow-[0_20px_40px_-20px_rgb(20_32_42/0.5)]">
        <Image
          src={inset.src}
          alt={inset.alt}
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
          {stamp.top}
          <b className="block text-[22px] tracking-tight normal-case">{stamp.big}</b>
          {stamp.bottom}
        </span>
      </div>
    </div>
  );
}
