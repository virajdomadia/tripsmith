import { Badge } from '@/components/ui/badge';
import { stateLabel, type BookingStatus, type CancelReason } from '@/lib/admin/booking-filters';

const VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'outline'> = {
  pending: 'secondary',
  confirmed: 'default',
  partially_paid: 'secondary',
  completed: 'outline',
  cancelled: 'outline',
};

export function StateBadge(b: {
  status: BookingStatus;
  holdLive: boolean;
  cancelReason: CancelReason | null;
}) {
  return <Badge variant={VARIANT[b.status]}>{stateLabel(b)}</Badge>;
}

/** R22's red flag: money arrived with no seat behind it, and it has to go back by hand. */
export function RefundFlag() {
  return (
    <span className="inline-flex items-center rounded-md bg-bad-soft px-2 py-0.5 text-xs font-bold text-bad">
      Refund needed
    </span>
  );
}

/** B9's request, waiting on the owner (resolving it is B11). */
export function CancelRequested() {
  return (
    <span className="inline-flex items-center rounded-md bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">
      Cancel requested
    </span>
  );
}
