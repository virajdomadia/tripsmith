import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { ContactInfo } from '@/components/site/contact/ContactInfo';
import { MapEmbed } from '@/components/site/contact/MapEmbed';
import { EnquiryForm } from '@/components/site/enquiry/EnquiryForm';
import { PageHead } from '@/components/site/PageHead';
import { BUSINESS } from '@/lib/business';
import { formStateFrom } from '@/lib/enquiry-form-state';
import { travelMonthOptions } from '@/lib/enquiry-schema';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Reads searchParams (the no-JS enquiry round trip re-fills the form), so it renders per request. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Contact',
  description: `Call ${BUSINESS.phoneDisplay}, WhatsApp, or send a message — a person replies within two hours, ${BUSINESS.hours}. ${BUSINESS.address}, ${BUSINESS.city}.`,
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = formStateFrom(await searchParams);
  return (
    <Container className="pb-20">
      <PageHead
        crumb="Contact"
        title="Talk to a person."
        lede={`Call, WhatsApp, or send a message — we reply within two hours, ${BUSINESS.hours}.`}
      />
      <div className="mt-5 grid items-start gap-8 md:grid-cols-2">
        <div>
          <ContactInfo />
          <MapEmbed />
        </div>
        <div id="enquire">
          <EnquiryForm kind="contact" months={travelMonthOptions()} {...state} />
        </div>
      </div>
    </Container>
  );
}
