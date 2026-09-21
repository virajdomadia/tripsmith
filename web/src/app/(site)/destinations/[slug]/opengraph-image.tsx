import { cheapest, loadDestination } from '@/lib/catalog';
import { inr, monthRange } from '@/lib/format';
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og/card';

export const alt = 'Destination card';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** `/destinations/<slug>/opengraph-image` (F13): cover + name + trips · best months + from-price. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await loadDestination(slug);
  const from = cheapest(d.packages.map((p) => p.startingPricePaise));
  const n = d.packages.length;
  return ogCard({
    cover: d.coverUrl,
    name: d.name,
    line: `${n} ${n === 1 ? 'trip' : 'trips'} · best ${monthRange(d.bestMonths)}`,
    price: from ? `From ${inr(from)}` : null,
    site: new URL(SITE_URL).host,
  });
}
