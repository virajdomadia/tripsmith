import Link from 'next/link';
import { BUSINESS } from '@/lib/business';
import { BrandMark } from './BrandMark';
import { Container } from './Container';
import { Phone } from './home/icons';
import { MobileMenu } from './MobileMenu';

// Review 2026-11-27 (M7): "Packages", the word the listing page, footer and breadcrumbs use.
const NAV = [
  ['/destinations', 'Destinations'],
  ['/packages', 'Packages'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
  ['/account', 'My trips'],
] as const;

/** Public header: the four site sections, My trips (B8) and the phone number (S1). Home is the
 * logo. Static on every page, so it never asks who is signed in: `/account` sends a signed-out
 * visitor on to the sign-in. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      {/* Below `lg` the right 56px hold the chat button (Concierge.tsx), fixed over the header. */}
      <Container className="flex h-16 items-center justify-between max-lg:pr-14">
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
              // Below `lg` only Packages stays in the bar; the rest are in the menu.
              className={`min-h-11 items-center rounded-chip px-3 whitespace-nowrap hover:bg-bg2 hover:text-ink ${href === '/packages' ? 'flex' : 'hidden lg:flex'}`}
            >
              {label}
            </Link>
          ))}
          <a
            href={BUSINESS.phoneHref}
            aria-label={`Call us on ${BUSINESS.phoneDisplay}`}
            className="grid size-11 place-items-center rounded-full text-ink hover:bg-bg2 md:hidden"
          >
            <Phone className="size-5 text-action-ink" />
          </a>
          <a
            href={BUSINESS.phoneHref}
            className="num ml-2 hidden min-h-11 items-center gap-1.5 rounded-chip border border-line px-3 text-ink no-underline hover:border-ink md:inline-flex"
          >
            <Phone className="size-4 text-action-ink" />
            {BUSINESS.phoneDisplay}
          </a>
          <MobileMenu links={NAV.filter(([href]) => href !== '/packages')} />
        </nav>
      </Container>
    </header>
  );
}
