import Link from 'next/link';
import { api } from '@/lib/api';
import { BUSINESS, whatsappHref } from '@/lib/business';
import { BrandMark } from './BrandMark';
import { Container } from './Container';

type Links = readonly (readonly [href: string, label: string])[];

const COMPANY: Links = [
  ['/destinations', 'Destinations'],
  ['/packages', 'Holiday packages'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
];

const POLICIES: Links = [
  ['/terms', 'Terms of service'],
  ['/privacy', 'Privacy policy'],
  ['/cancellation-policy', 'Cancellation & refunds'],
];

/** The footer never breaks a page: no api (CI builds, outages) → no destination links. */
async function destinationLinks(): Promise<Links> {
  try {
    const { items } = await api('/destinations', { tags: ['destinations'], revalidate: 3600 });
    return items.map((d) => [`/destinations/${d.slug}`, d.name] as const);
  } catch {
    return [];
  }
}

function Column({ title, links }: { title: string; links: Links }) {
  return (
    <div>
      <b className="mb-2.5 block font-bold text-white">{title}</b>
      <ul className="grid gap-1.5">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full footer (S1): contact block, destinations, company, policies, fine print. No year baked in. */
export async function SiteFooter() {
  const destinations = await destinationLinks();
  return (
    <footer className="mt-20 bg-ink pt-12 pb-6 text-sm text-[#b7c0c8]">
      <Container>
        <div className="grid gap-7 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <span className="mb-2.5 flex items-center gap-2 font-extrabold text-white">
              <BrandMark size={22} />
              {BUSINESS.legalName}
            </span>
            <address className="leading-relaxed not-italic">
              {BUSINESS.address}, {BUSINESS.city}
              <br />
              <a href={BUSINESS.phoneHref} className="hover:text-white">
                {BUSINESS.phoneDisplay}
              </a>
              {' · '}
              <a href={whatsappHref()} className="hover:text-white">
                WhatsApp
              </a>
              {' · '}
              <a href={`mailto:${BUSINESS.email}`} className="hover:text-white">
                {BUSINESS.email}
              </a>
              <br />
              {BUSINESS.hours}
            </address>
          </div>
          {destinations.length > 0 && <Column title="Destinations" links={destinations} />}
          <Column title="Company" links={COMPANY} />
          <Column title="Policies" links={POLICIES} />
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-2.5 border-t border-[#2a3944] pt-4 text-xs">
          <span>© {BUSINESS.legalName} · a portfolio project by Viraj Domadia</span>
          <span>Photos: Wikimedia Commons contributors (CC BY / CC BY-SA)</span>
        </div>
      </Container>
    </footer>
  );
}
