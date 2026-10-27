import type { Retention, Rules } from '../src/lib/rules';

/**
 * `GET /meta`'s `rules` and `retention` as the api serves them today — test data, not a copy the
 * app reads (Q-5: the app takes these from /meta). api/tests/test_meta.py pins the same values.
 */
export const RETENTION: Retention = { enquiryDays: 365, detailsDays: 30, sessionDays: 30 };

export const RULES: Rules = {
  depositPercent: 25,
  balanceDays: 30,
  graceDays: 2,
  minPartPaise: 1_000_00,
  reminderDays: [7, 3, 0],
  holdMinutes: 10,
  leadDays: 2,
  freeChangeDays: 30,
  changeHoldMinutes: 10,
  onlineChangeDays: 15,
  changeFeePaise: 1_000_00,
  gstPercent: 5,
  cancellationTiers: [
    {
      fromDays: 30,
      keptPercent: 0,
      refund: 'full refund, minus any non-refundable flight or train tickets we bought for you',
    },
    { fromDays: 15, keptPercent: 50, refund: '50% of the package price is retained' },
    { fromDays: 0, keptPercent: 100, refund: 'no refund' },
  ],
  ages: { childMin: 5, childMax: 11, adultMin: 12 },
  maxTravellers: 12,
  retention: RETENTION,
};
