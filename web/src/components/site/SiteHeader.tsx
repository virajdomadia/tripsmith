import Link from 'next/link';
import { BUSINESS } from '@/lib/business';
import { BrandMark } from './BrandMark';
import { Container } from './Container';
import { Phone } from './home/icons';

const NAV = [
  ['/destinations', 'Destinations'],
  ['/packages', 'Trips'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
] as const;

/** Public header: the four site sections and the phone number (S1). Home is the logo. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink no-underline"
        >
          <BrandMark />
          <span className="sr-only min-[420px]:not-sr-only">Tripsmith</span>
        </Link>
        <nav
          aria-label="Main"
          className="flex items-center gap-0.5 text-sm font-semibold text-mute sm:gap-1"
        >
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-chip px-2 py-2 hover:bg-bg2 hover:text-ink sm:px-3"
            >
              {label}
            </Link>
          ))}
          <a
            href={BUSINESS.phoneHref}
            className="num ml-2 hidden items-center gap-1.5 rounded-chip border border-line px-3 py-1.5 text-ink no-underline hover:border-ink md:inline-flex"
          >
            <Phone className="size-4 text-action-ink" />
            {BUSINESS.phoneDisplay}
          </a>
        </nav>
      </Container>
    </header>
  );
}
