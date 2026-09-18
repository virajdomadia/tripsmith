import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('privacy');

export default function PrivacyPage() {
  return <PolicyPage slug="privacy" />;
}
