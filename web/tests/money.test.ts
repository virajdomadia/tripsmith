import { describe, expect, it } from 'vitest';
import { equation, lakh, net, scale, tick, type MoneyDay, type MoneyDesk } from '@/lib/admin/money';

const day = (date: string, over: Partial<MoneyDay> = {}): MoneyDay => ({
  date,
  inPaise: 0,
  outPaise: 0,
  owePaise: 0,
  lines: [],
  ...over,
});

describe('money helpers', () => {
  it('writes lakhs above ₹1 lakh and rupees below', () => {
    expect(lakh(6_84_250_00)).toBe('₹6.84 L');
    expect(lakh(1_00_000_00)).toBe('₹1 L');
    expect(lakh(84_250_00)).toBe('₹84,250');
    expect(lakh(1_00_00_000_00)).toBe('₹100 L');
    expect(lakh(1_20_00_000_00)).toBe('₹120 L');
    expect(lakh(-1_50_000_00)).toBe('−₹1.5 L');
  });

  it('balances the equation, counting holds only when asked', () => {
    const m = {
      collectedPaise: 100_000,
      refundedPaise: 10_000,
      toRecordPaise: 5_000,
      holdsPaise: 20_000,
    } as MoneyDesk;
    expect(equation(m, false)).toEqual({
      collected: 100_000,
      refunds: 15_000,
      holds: 0,
      kept: 85_000,
    });
    expect(equation(m, true).kept).toBe(105_000);
  });

  it('scales bars to the busiest day and keeps small amounts visible', () => {
    const days = [
      day('2026-09-01', { inPaise: 100 }),
      day('2026-09-02', { inPaise: 10_000, owePaise: 50 }),
    ];
    const bar = scale(days, 150, 56);
    expect(bar(days[1]!)).toEqual({ in: 150, out: 0, owe: 56 });
    expect(bar(days[0]!).in).toBe(2);
    expect(bar(day('2026-09-03')).in).toBe(0);
  });

  it('labels the axis on the 1st, every fifth day and today', () => {
    expect(tick('2026-09-01', '2026-09-27')).toBe('1 Sep');
    expect(tick('2026-09-10', '2026-09-27')).toBe('10');
    expect(tick('2026-09-11', '2026-09-27')).toBe('');
    expect(tick('2026-09-27', '2026-09-27')).toBe('Today');
  });

  it('nets a day: money in minus refunds', () => {
    expect(
      net([
        { ref: 'TB-1', name: 'A', kind: 'in', label: 'Razorpay', amountPaise: 500 },
        { ref: 'TB-2', name: 'B', kind: 'owe', label: 'Refund to record', amountPaise: 200 },
      ]),
    ).toBe(300);
  });
});
