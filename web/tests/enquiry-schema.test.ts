import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formStateFrom } from '../src/lib/enquiry-form-state';
import {
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

describe('formStateFrom', () => {
  it('reads the proxy redirect and ignores junk', () => {
    expect(
      formStateFrom({
        fieldErrors: '{"phone":"bad"}',
        name: 'Priya',
        error: 'rate_limited',
        website: 'x',
      }),
    ).toEqual({
      defaultValues: { name: 'Priya' },
      fieldErrors: { phone: 'bad' },
      error: 'rate_limited',
    });
    expect(formStateFrom({ fieldErrors: 'not json', error: 'nope' })).toEqual({
      defaultValues: {},
      fieldErrors: {},
      error: undefined,
    });
  });
});
