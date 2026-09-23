import Link from 'next/link';
import { monthLabel, partyLabel, phoneLabel } from './EnquiriesTable';
import { TYPE_LABELS } from '@/lib/admin/enquiry-filters';
import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';

type AdminEnquiry = components['schemas']['AdminEnquiry'];

const EMAIL_STATUS_LABELS: Record<AdminEnquiry['emailStatus'], string> = {
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Not sent',
};

function Fact({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <small className="block text-xs text-mute">{label}</small>
      <b className="block text-sm">{children}</b>
    </div>
  );
}

/** Mockup A7's `.kvs` grid: everything the visitor submitted, in the order they typed it. */
export function EnquiryFacts({ enquiry: e }: { enquiry: AdminEnquiry }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Fact label="Name">{e.name}</Fact>
      <Fact label="Mobile">+91 {phoneLabel(e.phone)}</Fact>
      <Fact label="Email">{e.email}</Fact>
      <Fact label="Type">{TYPE_LABELS[e.type]}</Fact>
      <Fact label="Package">
        {e.package ? (
          <Link href={`/packages/${e.package.slug}`} className="text-primary" target="_blank">
            {e.package.name}
          </Link>
        ) : (
          '—'
        )}
      </Fact>
      <Fact label="Travel month">{monthLabel(e.travelMonth)}</Fact>
      <Fact label="Travellers">{partyLabel(e.adults, e.children)}</Fact>
      {e.budgetPaise !== null && <Fact label="Budget per person">{inr(e.budgetPaise)}</Fact>}
      {e.preferredDates && <Fact label="Preferred dates">{e.preferredDates}</Fact>}
      {e.changes && (
        <Fact label="Changes asked for" wide>
          <span className="font-medium">{e.changes}</span>
        </Fact>
      )}
      {e.message && (
        <Fact label="Message" wide>
          <span className="font-medium">{e.message}</span>
        </Fact>
      )}
      <Fact label="Emails">{EMAIL_STATUS_LABELS[e.emailStatus]} · owner and visitor</Fact>
      {/* No city: there is no geo lookup, and `ip_hash` is a hash the api never returns. */}
      <Fact label="Source">
        <span title={e.userAgent ?? undefined}>{e.device}</span>
      </Fact>
    </div>
  );
}
