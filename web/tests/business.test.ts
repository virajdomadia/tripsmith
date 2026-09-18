import { describe, expect, it } from 'vitest';
import { BUSINESS, whatsappHref } from '../src/lib/business';

describe('business constants', () => {
  it('phone href is E.164 with no spaces', () => {
    expect(BUSINESS.phoneHref).toBe('tel:+919845012345');
    expect(BUSINESS.phoneDisplay).toBe('+91 98450 12345');
  });

  it('whatsapp link uses wa.me with an encoded prefilled message', () => {
    expect(whatsappHref()).toMatch(/^https:\/\/wa\.me\/\d+$/);
    expect(whatsappHref('Hi Tripsmith, I want to plan a trip')).toBe(
      `${whatsappHref()}?text=Hi%20Tripsmith%2C%20I%20want%20to%20plan%20a%20trip`,
    );
  });

  it('has the contact-page facts', () => {
    expect(BUSINESS.addressLine2).toMatch(/floor/i);
    expect(BUSINESS.mapEmbedSrc).toMatch(/^https:\/\/maps\.google\.com\/maps\?q=.*&output=embed$/);
    expect(BUSINESS.mapsHref).toMatch(/^https:\/\/maps\.google\.com\//);
    expect(BUSINESS.founded).toBe(2019);
    expect(BUSINESS.afterHours.length).toBeGreaterThan(10);
  });
});
