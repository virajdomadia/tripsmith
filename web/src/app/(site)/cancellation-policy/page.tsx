import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('cancellation-policy');
// ISR: served from Vercel's CDN, rebuilt at most hourly or when the api purges a tag — a visit
// (or a monitor's ping) costs no function time. Vercel builds need the api (API_URL).
export const revalidate = 3600;

export default function CancellationPolicyPage() {
  return <PolicyPage slug="cancellation-policy" />;
}
