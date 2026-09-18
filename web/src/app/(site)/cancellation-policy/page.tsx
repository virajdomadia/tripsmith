import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('cancellation-policy');

export default function CancellationPolicyPage() {
  return <PolicyPage slug="cancellation-policy" />;
}
