import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  draftCookieHeader,
  draftCookieValue,
  draftFrom,
  formStateFrom,
  thanksHref,
} from '../src/lib/enquiry-form-state';
import {
  BUDGET_MESSAGE,
  enquirySchema,
  fieldErrorsOf,
  normalisePhone,
  travelMonthOptions,
} from '../src/lib/enquiry-schema';

type Case = Record<string, unknown>;
const CASES = JSON.parse(
  readFileSync(resolve(__dirname, '../../api/tests/fixtures/enquiry_cases.json'), 'utf8'),
) as { valid: Case[]; invalid: { field: string; body: Case }[] };

const expand = (body: Case) =>
  Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k, v === '@@LONG_1001@@' ? 'a'.repeat(1001) : v]),
  );

describe('enquirySchema mirrors EnquiryCreate (api/tests/fixtures/enquiry_cases.json)', () => {
  it.each(CASES.valid.map((b) => [`${b.type}:${b.name}`, b] as const))('accepts %s', (_, body) => {
    const parsed = enquirySchema.safeParse(expand(body));
    expect(parsed.success, JSON.stringify(parsed)).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe('9845022110');
      expect(parsed.data.email).toBe(parsed.data.email.toLowerCase().trim());
    }
  });

  it.each(CASES.invalid.map((c) => [`${c.field}:${c.body.name}`, c] as const))(
    'rejects %s on that field',
    (_, c) => {
      const parsed = enquirySchema.safeParse(expand(c.body));
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(Object.keys(fieldErrorsOf(parsed.error))).toContain(c.field);
    },
  );

  it('drops a stray package on contact and keeps custom fields only for custom', () => {
    const contact = enquirySchema.parse(CASES.valid[3]);
    expect(contact.packageSlug).toBeUndefined();
    const standard = enquirySchema.parse({ ...CASES.valid[0], budget: 25000, changes: 'x' });
    expect(standard.budget).toBeUndefined();
    expect(standard.changes).toBeUndefined();
    const custom = enquirySchema.parse(CASES.valid[1]);
    expect(custom.budget).toBe(25000);
  });

  it('coerces the strings a native form posts', () => {
    const parsed = enquirySchema.parse({
      type: 'custom',
      packageSlug: 'north-goa-beaches',
      name: ' Priya ',
      phone: '98450 22110',
      email: 'P@X.IO',
      travelMonth: '',
      adults: '2',
      children: '0',
      message: '',
      preferredDates: '',
      budget: '20000',
      changes: '',
      website: '',
    });
    expect(parsed).toMatchObject({ name: 'Priya', adults: 2, children: 0, budget: 20000 });
    expect(parsed.travelMonth).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });
});

describe('normalisePhone', () => {
  it.each([
    ['9845022110', '9845022110'],
    ['+91 98450-22110', '9845022110'],
    ['09845022110', '9845022110'],
    ['919845022110', '9845022110'],
    ['(+91) 98450.22110', '9845022110'],
    ['12345', '12345'],
  ])('%s → %s', (raw, out) => expect(normalisePhone(raw)).toBe(out));
});

describe('travelMonthOptions', () => {
  it('lists the next twelve months from today, labelled for people', () => {
    const opts = travelMonthOptions(new Date('2026-09-18T10:00:00Z'));
    expect(opts).toHaveLength(12);
    expect(opts[0]).toEqual({ value: '2026-09', label: 'September 2026' });
    expect(opts[3]).toEqual({ value: '2026-12', label: 'December 2026' });
    expect(opts[11]).toEqual({ value: '2027-08', label: 'August 2027' });
  });
});

describe('enquirySchema budget and name match the api', () => {
  const custom = {
    type: 'custom',
    packageSlug: 'north-goa-beaches',
    name: 'Priya',
    phone: '9845022110',
    email: 'p@x.io',
    adults: '2',
  };

  it('truncates a decimal budget like int(float(v))', () => {
    expect(enquirySchema.parse({ ...custom, budget: '1500.5' }).budget).toBe(1500);
    expect(enquirySchema.parse({ ...custom, budget: '1e3' }).budget).toBe(1000);
  });

  it('uses the api wording on both ends of the range', () => {
    for (const budget of ['999.9', '1000001']) {
      const parsed = enquirySchema.safeParse({ ...custom, budget });
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(fieldErrorsOf(parsed.error).budget).toBe(BUDGET_MESSAGE);
    }
    expect(BUDGET_MESSAGE).toBe('Between ₹1,000 and ₹1,000,000 per person');
  });

  it('says what is wrong with an over-long name', () => {
    const parsed = enquirySchema.safeParse({ ...custom, name: 'a'.repeat(81) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrorsOf(parsed.error).name).toMatch(/80 characters/);
  });
});

describe('formStateFrom', () => {
  it('reads the proxy redirect and ignores junk', () => {
    expect(
      formStateFrom({
        fieldErrors: '{"phone":"bad"}',
        adults: '3',
        error: 'rate_limited',
        website: 'x',
      }),
    ).toEqual({
      defaultValues: { adults: '3' },
      fieldErrors: { phone: 'bad' },
      error: 'rate_limited',
    });
    expect(formStateFrom({ fieldErrors: 'not json', error: 'nope' })).toEqual({
      defaultValues: {},
      fieldErrors: {},
      error: undefined,
    });
  });

  it('takes typed details from the draft cookie, never from the query', () => {
    const state = formStateFrom(
      { name: 'From the URL', phone: '9845022110', type: 'custom' },
      { name: 'Priya', email: 'p@x.io' },
    );
    expect(state.defaultValues).toEqual({ type: 'custom', name: 'Priya', email: 'p@x.io' });
  });
});

describe('draft cookie', () => {
  it('round-trips only the private fields', () => {
    const value = draftCookieValue({
      name: 'Priya',
      phone: '98450 22110',
      message: '50% off? café',
      adults: '2',
      website: '',
    });
    expect(value).toBeDefined();
    expect(value).not.toMatch(/[;,\s]/); // safe as a cookie value
    // Next hands the page the decoded value; both spellings parse.
    const expected = { name: 'Priya', phone: '98450 22110', message: '50% off? café' };
    expect(draftFrom(value)).toEqual(expected);
    expect(draftFrom(decodeURIComponent(value!))).toEqual(expected);
    expect(draftFrom('garbage{')).toEqual({});
  });

  it('drops the long free text rather than overflow a 4 KB cookie', () => {
    const value = draftCookieValue({ name: 'Priya', message: 'अ'.repeat(1000) });
    expect(value!.length).toBeLessThanOrEqual(3800);
    expect(draftFrom(value)).toEqual({ name: 'Priya' });
  });

  it('is httpOnly and short-lived, and clears with Max-Age=0', () => {
    expect(draftCookieHeader('x', true)).toMatch(
      /^ts_enquiry_draft=x; Max-Age=600; Path=\/; HttpOnly; SameSite=Lax; Secure$/,
    );
    expect(draftCookieHeader(undefined, false)).toBe(
      'ts_enquiry_draft=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    );
  });
});

describe('thanksHref', () => {
  it('carries ref, first name and package', () => {
    expect(
      thanksHref({ ref: 'TS-ABC234', firstName: 'Priya', packageSlug: 'north-goa-beaches' }),
    ).toBe('/enquiry/thanks?ref=TS-ABC234&name=Priya&package=north-goa-beaches');
  });
  it('adds emailed=1 only when the confirmation really went out', () => {
    expect(thanksHref({ ref: 'TS-ABC234', firstName: 'Priya', emailed: true })).toBe(
      '/enquiry/thanks?ref=TS-ABC234&name=Priya&emailed=1',
    );
    expect(thanksHref({ ref: 'TS-ABC234', firstName: 'Priya', emailed: false })).not.toContain(
      'emailed',
    );
  });
});
