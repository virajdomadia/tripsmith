import type { components } from '@/lib/api-types';
import { BUSINESS } from '../business';

type Leader = components['schemas']['LeaderCardOut'];

/** schema.org Person for a trip leader's page (R41): who they are and who they lead trips for.
 *  No `telephone` — the phone is the trip pack's (R48). No invented fields. */
export function leaderJsonLd(l: Leader, url: string, siteUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: l.name,
    url,
    jobTitle: 'Trip leader',
    description: l.bio,
    knowsLanguage: l.languages,
    ...(l.photoUrl ? { image: l.photoUrl } : {}),
    worksFor: { '@type': 'TravelAgency', name: BUSINESS.name, url: siteUrl },
  };
}
