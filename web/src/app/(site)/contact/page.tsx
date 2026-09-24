import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { ContactInfo } from '@/components/site/contact/ContactInfo';
import { MapEmbed } from '@/components/site/contact/MapEmbed';
import { EnquiryForm } from '@/components/site/enquiry/EnquiryForm';
import { PageHead } from '@/components/site/PageHead';
import { BUSINESS } from '@/lib/business';
import { formStateFrom } from '@/lib/enquiry-form-state';
import { travelMonthOptions } from '@/lib/enquiry-schema';
import { OPEN_GRAPH } from '@/lib/seo/open-graph';
import { absolute } from '@/lib/seo/site-url';

/** Reads searchParams (the no-JS enquiry round trip re-fills the form), so it renders per request. */
export const dynamic = 'force-dynamic';

const CONTACT_DESCRIPTION = `Call ${BUSINESS.phoneDisplay}, WhatsApp, or send a message — a person replies within two hours, ${BUSINESS.hours}. ${BUSINESS.address}, ${BUSINESS.city}.`;

export const metadata: Metadata = {
  title: 'Contact',
  description: CONTACT_DESCRIPTION,
  alternates: { canonical: absolute('/contact') },
  openGraph: {
    ...OPEN_GRAPH,
    title: 'Contact Tripsmith',
    description: CONTACT_DESCRIPTION,
    url: absolute('/contact'),
  },
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
