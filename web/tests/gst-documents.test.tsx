// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Documents } from '@/components/site/account/Documents';
import { billingErrors, documentHref, GST_STATES, STATE_NAMES } from '@/lib/gst';

afterEach(cleanup);

describe('GST at checkout', () => {
  it('lists every State and UT once, each with its two-digit code', () => {
    expect(STATE_NAMES).toHaveLength(36);
    expect(new Set(Object.values(GST_STATES)).size).toBe(36);
    expect(GST_STATES.Karnataka).toBe('29');
  });

  it('needs a State; a GSTIN is optional but must match it and bring a company', () => {
    expect(billingErrors('Karnataka', '', '')).toEqual({});
    expect(billingErrors('Karnataka', '29abcde1234f1z5', 'Acme')).toEqual({});
    expect(Object.keys(billingErrors('', '', ''))).toEqual(['contact.state']);
    expect(Object.keys(billingErrors('Goa', '29ABCDE1234F1Z5', ''))).toEqual([
      'contact.gstin',
      'contact.companyName',
    ]);
  });
});

describe('Documents', () => {
  it('links each document to the download route, credit notes as money back', () => {
    render(
      <Documents
        bookingRef="TB-7F3K2Q"
        documents={[
          {
            key: 'receipt-abcdefgh1234',
            kind: 'receipt',
            title: 'Payment receipt',
            number: null,
            amountPaise: 11_998_00,
            dated: '2026-09-28',
          },
          {
            key: 'invoice',
            kind: 'invoice',
            title: 'Tax invoice',
            number: 'TS/2026-27/0001',
            amountPaise: 11_998_00,
            dated: '2026-09-28',
          },
          {
            key: 'credit-r1',
            kind: 'credit_note',
            title: 'Credit note',
            number: null,
            amountPaise: 5_999_00,
            dated: '2026-09-29',
          },
        ]}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      documentHref('TB-7F3K2Q', 'receipt-abcdefgh1234'),
      '/account/bookings/TB-7F3K2Q/documents/invoice',
      '/account/bookings/TB-7F3K2Q/documents/credit-r1',
    ]);
    expect(links[0]!.textContent).not.toContain('/'); // no number until it is issued
    expect(links[1]!.textContent).toContain('TS/2026-27/0001');
    expect(links[2]!.textContent).toContain('−₹5,999');
  });
});
