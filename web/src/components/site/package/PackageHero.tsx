import Link from 'next/link';
import { Photo } from '@/components/site/Photo';
import type { components } from '@/lib/api-types';
import { duration } from '@/lib/format';
import { ShareButtons } from './ShareButtons';

type PackageDetail = components['schemas']['PackageDetail'];

export function PackageHero({ pkg, url }: { pkg: PackageDetail; url: string }) {
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
        <Link href={`/destinations/${pkg.destination.slug}`} className="hover:text-ink">
          {pkg.destination.name}
        </Link>
        <span aria-hidden>›</span>
        <span className="text-ink">{pkg.name}</span>
      </nav>
      <div className="relative mt-3.5">
        {pkg.cover ? (
          <Photo
            src={pkg.cover.url}
            alt={pkg.cover.alt}
            sizes="(min-width: 1280px) 1220px, 100vw"
            priority
            className="aspect-[4/5] rounded-card sm:aspect-[21/9]"
          />
        ) : (
          <div className="aspect-[4/5] rounded-card bg-bg2 sm:aspect-[21/9]" />
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 rounded-b-card bg-gradient-to-t from-[rgb(10_20_30/0.7)] to-transparent p-5 text-white [text-shadow:0_2px_20px_rgb(0_0_0/0.4)] sm:p-8">
          <div className="min-w-0">
            <h1 className="text-[clamp(32px,4.6vw,56px)]">{pkg.name}</h1>
            <div className="mt-2.5 flex flex-wrap gap-3.5 text-sm font-semibold">
              <span>{duration(pkg.nights, pkg.days)}</span>
              <span>{pkg.departureCity}</span>
              <span className="capitalize">{pkg.themes.join(' · ')}</span>
            </div>
          </div>
          <ShareButtons
            name={pkg.name}
            line={`${duration(pkg.nights, pkg.days)} · ${pkg.destination.name}`}
            url={url}
          />
        </div>
      </div>
    </>
  );
}
