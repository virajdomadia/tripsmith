import { describe, expect, it } from 'vitest';
import { emailSubject, mailtoHref, replyMessage, telHref, waHref } from '@/lib/admin/enquiry-links';

const enquiry = { name: 'Priya Sharma', ref: 'TS-7F3K2Q', package: { name: 'North Goa Beaches' } };

describe('contact links', () => {
  it('dials the stored ten digits with the country code', () => {
    expect(telHref('9845022110')).toBe('tel:+919845022110');
  });

  it('opens WhatsApp to the visitor, not to the business number', () => {
    expect(waHref('9845022110', 'Hi Priya')).toBe('https://wa.me/919845022110?text=Hi%20Priya');
  });

  it('prefills the mail subject', () => {
    expect(mailtoHref('priya.s@gmail.com', 'Tripsmith · TS-7F3K2Q')).toBe(
      'mailto:priya.s@gmail.com?subject=Tripsmith%20%C2%B7%20TS-7F3K2Q',
    );
  });
});

describe('reply copy', () => {
  it('greets by first name and names the trip and the ref', () => {
    expect(replyMessage(enquiry)).toBe(
      'Hi Priya, this is Tripsmith about your enquiry for North Goa Beaches (TS-7F3K2Q).',
    );
  });

  it('drops the trip for a general enquiry', () => {
    expect(replyMessage({ ...enquiry, package: null })).toBe(
      'Hi Priya, this is Tripsmith about your enquiry (TS-7F3K2Q).',
    );
  });

  it('builds the email subject from the ref', () => {
    expect(emailSubject(enquiry)).toBe('Tripsmith · your enquiry TS-7F3K2Q');
  });
});
