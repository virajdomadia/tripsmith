import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, type EnquiryStatus } from '@/lib/admin/enquiry-filters';

/** Mockup A6 `.badge.<status>`: new is the loud one, closed is the quiet one. */
const VARIANT: Record<EnquiryStatus, 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  contacted: 'secondary',
  converted: 'secondary',
  closed: 'outline',
};

export function StatusBadge({ status }: { status: EnquiryStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
