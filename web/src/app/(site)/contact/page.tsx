import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { ContactForm } from '@/components/site/contact/ContactForm';
import { ContactInfo } from '@/components/site/contact/ContactInfo';
import { MapEmbed } from '@/components/site/contact/MapEmbed';
import { PageHead } from '@/components/site/PageHead';
import { BUSINESS } from '@/lib/business';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Contact',
  description: `Call ${BUSINESS.phoneDisplay}, WhatsApp, or send a message — a person replies within two hours, ${BUSINESS.hours}. ${BUSINESS.address}, ${BUSINESS.city}.`,
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default function ContactPage() {
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
        <ContactForm />
      </div>
    </Container>
  );
}
