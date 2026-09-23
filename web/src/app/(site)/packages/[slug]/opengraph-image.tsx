import { loadPackage } from '@/lib/catalog';
import { duration, inr } from '@/lib/format';
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og/card';
import { SITE_URL } from '@/lib/seo/site-url';

export const alt = 'Trip card';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** `/packages/<slug>/opengraph-image` (F13): cover + name + duration · destination + from-price. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await loadPackage(slug);
  return ogCard({
    cover: p.cover?.url,
    name: p.name,
    line: `${duration(p.nights, p.days)} · ${p.destination.name} · ${p.departureCity}`,
    price: p.startingPricePaise ? `From ${inr(p.startingPricePaise)}` : null,
    site: new URL(SITE_URL).host,
  });
}
