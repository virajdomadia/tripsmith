import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('cancellation-policy');
// The numbers come from /meta (Q-5): rendered on request, so a build needs no api; the read is
// cached an hour.
export const dynamic = 'force-dynamic';

export default function CancellationPolicyPage() {
  return <PolicyPage slug="cancellation-policy" />;
}
