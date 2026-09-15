import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

/** Root 404: unknown URLs and `notFound()` from pages. Route-group layouts do not wrap it, so it
 * renders the site chrome itself. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main>
        <Container className="grid justify-items-center gap-3.5 py-24 text-center">
          <p className="label-caps">404</p>
          <h1 className="text-4xl">That trip is not on the map</h1>
          <p className="max-w-[40ch] text-mute">
            The page may have moved, or the package is no longer live.
          </p>
          <Link
            href="/"
            className="rounded-btn bg-action px-5 py-3 font-bold text-ink transition-colors hover:bg-action-ink"
          >
            Back to home
          </Link>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
