import { describe, expect, it } from 'vitest';
import { itineraryPdfHref } from '@/lib/pdf';

describe('itineraryPdfHref', () => {
  it('points at the api through the /api rewrite', () => {
    expect(itineraryPdfHref('north-goa-beaches')).toBe(
      '/packages/north-goa-beaches/itinerary.pdf',
    );
  });
  it('encodes the slug', () => {
    expect(itineraryPdfHref('a b/c')).toBe('/packages/a%20b%2Fc/itinerary.pdf');
  });
});
