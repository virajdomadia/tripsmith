import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/site/Container';
import { EnquiryForm } from '@/components/site/enquiry/EnquiryForm';
import { PackageSummary } from '@/components/site/enquiry/PackageSummary';
import { api, ApiRequestError } from '@/lib/api';
import { BUSINESS } from '@/lib/business';
import { formStateFrom } from '@/lib/enquiry-form-state';
import { travelMonthOptions } from '@/lib/enquiry-schema';
import { absolute } from '@/lib/seo/site-url';

type Params = { slug: string };
type Search = Record<string, string | string[] | undefined>;

/** Reads searchParams (the no-JS round trip re-fills the form), so it renders per request. */
export const dynamic = 'force-dynamic';

async function loadPackage(slug: string) {
  try {
    return await api('/packages/{slug}', {
      params: { slug },
      tags: [`package:${slug}`],
      revalidate: 3600,
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const pkg = await loadPackage(slug);
  return {
    title: `Enquire · ${pkg.name}`,
    description: `Ask about ${pkg.name} — a person calls you back within 2 hours, ${BUSINESS.hours}.`,
    alternates: { canonical: absolute(`/packages/${pkg.slug}/enquire`) },
    robots: { index: false },
  };
}

export default async function EnquirePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const pkg = await loadPackage(slug);
  const state = formStateFrom(sp);

  return (
    <Container className="pb-20">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <Link href={`/packages/${pkg.slug}`} className="hover:text-ink">
          {pkg.name}
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          Enquire
        </span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="text-[clamp(30px,3.6vw,44px)]">Enquire about this trip</h1>
        <p className="mt-1.5 max-w-[60ch] text-base text-mute">
          Fill this in and a person calls you back within two hours, {BUSINESS.hours}. Nothing to
          pay now.
        </p>
      </header>
      <div className="mt-5 grid items-start gap-10 lg:grid-cols-[1fr_380px]">
        <EnquiryForm
          kind="package"
          pkg={{ slug: pkg.slug, name: pkg.name }}
          months={travelMonthOptions()}
          {...state}
        />
        <PackageSummary pkg={pkg} />
      </div>
    </Container>
  );
}
