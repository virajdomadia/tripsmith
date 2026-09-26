import { describe, expect, it } from 'vitest';
import {
  type AdminCoupon,
  couponSchema,
  couponTerms,
  type CouponFormFields,
  fromCoupon,
  toInput,
} from '../src/lib/admin/coupon-schema';

/** B15 — the admin coupon form: rupees in, paise out; the kind decides which amount is sent. */

const BASE: CouponFormFields = {
  code: ' diwali10 ',
  kind: 'percent',
  amount: '',
  percent: '10',
  cap: '1000',
  min: '',
  startsOn: '2026-10-01',
  endsOn: '2026-10-31',
  useLimit: '',
  allPackages: true,
  packageIds: ['pkg_x'],
  active: true,
};

describe('coupon form schema', () => {
  it('upper-cases the code and sends paise, dropping what the kind does not use', () => {
    const parsed = couponSchema.parse(BASE);
    expect(toInput(parsed)).toEqual({
      code: 'DIWALI10',
      kind: 'percent',
      amountPaise: null,
      percent: 10,
      capPaise: 1_000_00,
      minPaise: null,
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      useLimit: null,
      allPackages: true,
      packageIds: [],
      active: true,
    });
    const flat = toInput(couponSchema.parse({ ...BASE, kind: 'flat', amount: '500' }));
    expect(flat).toMatchObject({ amountPaise: 500_00, percent: null, capPaise: null });
  });

  it('refuses a missing amount, a bad code, a backwards date range and no chosen trips', () => {
    const issues = (fields: Partial<CouponFormFields>) =>
      couponSchema.safeParse({ ...BASE, ...fields }).error?.issues.map((i) => i.path.join('.'));
    expect(issues({ kind: 'flat', amount: '' })).toEqual(['amount']);
    expect(issues({ percent: '95' })).toEqual(['percent']);
    expect(issues({ code: 'a b' })).toEqual(['code']);
    expect(issues({ endsOn: '2026-09-30' })).toEqual(['endsOn']);
    expect(issues({ allPackages: false, packageIds: [] })).toEqual(['packageIds']);
    expect(issues({ cap: '10.5' })).toEqual(['cap']);
  });

  it('round-trips a saved coupon and says what it gives', () => {
    const saved = {
      id: 'c1',
      code: 'WELCOME10',
      kind: 'percent',
      amountPaise: null,
      percent: 10,
      capPaise: 1_000_00,
      minPaise: 20_000_00,
      startsOn: '2026-09-26',
      endsOn: null,
      useLimit: 1000,
      allPackages: false,
      packages: [{ id: 'pkg_a', name: 'Kasol' }],
      active: true,
      state: 'active',
      uses: 3,
      liveHolds: 0,
      locked: true,
      createdAt: '2026-09-26T10:00:00Z',
    } satisfies AdminCoupon;
    const fields = fromCoupon(saved);
    expect(fields).toMatchObject({ cap: '1000', min: '20000', useLimit: '1000', endsOn: '' });
    expect(toInput(couponSchema.parse(fields))).toMatchObject({
      capPaise: 1_000_00,
      minPaise: 20_000_00,
      packageIds: ['pkg_a'],
    });
    expect(couponTerms(saved)).toBe('10 % off, up to ₹1,000');
    expect(couponTerms({ ...saved, kind: 'flat', amountPaise: 500_00 })).toBe('₹500 off');
  });
});
