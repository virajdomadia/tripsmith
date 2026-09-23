import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = { crumb: string; title: ReactNode; lede?: ReactNode };

/** Breadcrumb + h1 + one-line lede — the `pagehead` block every mockup page starts with. */
export function PageHead({ crumb, title, lede }: Props) {
  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 pt-3.5 text-[13px] text-mute [&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center"
      >
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          {crumb}
        </span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="max-w-[24ch] text-[clamp(30px,3.6vw,44px)]">{title}</h1>
        {lede && <p className="mt-1.5 max-w-[60ch] text-base text-mute">{lede}</p>}
      </header>
    </>
  );
}
