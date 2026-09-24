import { ArrowLeft, Download, Mail, MessageCircle, Phone } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { EnquiryFacts } from '@/components/admin/enquiries/EnquiryFacts';
import { istFullDate } from '@/components/admin/enquiries/ist-date';
import { NotesPanel } from '@/components/admin/enquiries/NotesPanel';
import { RelatedEnquiries } from '@/components/admin/enquiries/RelatedEnquiries';
import { StatusPicker } from '@/components/admin/enquiries/StatusPicker';
import { buttonVariants } from '@/components/ui/button';
import { TYPE_LABELS } from '@/lib/admin/enquiry-filters';
import { emailSubject, mailtoHref, replyMessage, telHref, waHref } from '@/lib/admin/enquiry-links';
import { api, ApiRequestError } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import { duration, inr } from '@/lib/format';
import { itineraryPdfHref } from '@/lib/pdf';

export const metadata = { title: 'Enquiry' };

/** Mockup A7. Two columns on a desktop: the enquiry and its timeline on the left, status and
 *  the trip on the right. */
export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  let enquiry;
  try {
    enquiry = await api('/admin/enquiries/{id}', { auth: true, params: { id } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const reply = replyMessage(enquiry);
  const panel = 'grid gap-3 rounded-card border border-line bg-bg p-4';
  const heading = 'text-sm font-extrabold';
  return (
    <>
      <PageHead
        title={`${enquiry.ref} · ${enquiry.name}`}
        subtitle={`${TYPE_LABELS[enquiry.type]} enquiry${
          enquiry.package ? ` · ${enquiry.package.name}` : ''
        } · received ${istFullDate(enquiry.createdAt)}`}
        actions={
          <>
            <a
              href={telHref(enquiry.phone)}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Phone className="size-4" aria-hidden />
              Call
            </a>
            <a
              href={waHref(enquiry.phone, reply)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
            <a
              href={mailtoHref(enquiry.email, emailSubject(enquiry))}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Mail className="size-4" aria-hidden />
              Email
            </a>
            <Link
              href="/admin/enquiries"
              className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Inbox
            </Link>
          </>
        }
      />

      <div className="grid gap-3.5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="grid gap-3.5">
          <section className={panel}>
            <h2 className={heading}>Enquiry</h2>
            <EnquiryFacts enquiry={enquiry} />
          </section>
          <section className={panel}>
            <h2 className={heading}>
              Notes <span className="font-semibold text-mute">· append-only</span>
            </h2>
            <NotesPanel
              id={enquiry.id}
              notes={enquiry.notes}
              ownerName={session?.user.name ?? 'Owner'}
            />
          </section>
        </div>

        <div className="grid gap-3.5">
          <section className={panel}>
            <h2 className={heading}>Status</h2>
            <StatusPicker id={enquiry.id} status={enquiry.status} />
            <p className="text-xs text-mute">Every change is added to the notes below.</p>
          </section>

          {enquiry.package && (
            <section className={panel}>
              <h2 className={heading}>Trip</h2>
              {enquiry.package.coverUrl && (
                <span className="relative block h-32 overflow-hidden rounded-card bg-line">
                  <Image
                    src={enquiry.package.coverUrl}
                    alt=""
                    fill
                    sizes="320px"
                    className="object-cover"
                  />
                </span>
              )}
              <b className="text-sm">{enquiry.package.name}</b>
              <span className="text-[13px] text-mute">
                {duration(enquiry.package.nights, enquiry.package.days)}
                {enquiry.package.startingPricePaise > 0 &&
                  ` · from ${inr(enquiry.package.startingPricePaise)}`}
              </span>
              <a
                href={itineraryPdfHref(enquiry.package.slug)}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                <Download className="size-4" aria-hidden />
                Itinerary PDF
              </a>
            </section>
          )}

          <section className={panel}>
            <h2 className={heading}>Other enquiries · same phone</h2>
            <RelatedEnquiries items={enquiry.related} />
          </section>
        </div>
      </div>
    </>
  );
}
