import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('privacy');
// The numbers come from /meta (Q-5): rendered on request, so a build needs no api; the read is
// cached an hour.
export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return <PolicyPage slug="privacy" />;
}
