import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('terms');
// The numbers come from /meta (Q-5): rendered on request, so a build needs no api; the read is
// cached an hour.
export const dynamic = 'force-dynamic';

export default function TermsPage() {
  return <PolicyPage slug="terms" />;
}
