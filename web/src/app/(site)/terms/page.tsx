import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('terms');

export default function TermsPage() {
  return <PolicyPage slug="terms" />;
}
