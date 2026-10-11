import { describe, expect, it } from 'vitest';
import {
  apiQuery,
  change,
  csvHref,
  fyStart,
  lakh,
  monthLabel,
  monthLong,
  parseReportParams,
  pct,
  presetRange,
  reportsHref,
} from '../src/lib/admin/reports';

/** P12 (R55): the reports' IST presets, the URL and the number formats. */

const TODAY = '2026-10-11';

describe('presets', () => {
  it('turns each preset into IST calendar days', () => {
    expect(presetRange('month', TODAY)).toEqual(['2026-10-01', '2026-10-31']);
    expect(presetRange('last', TODAY)).toEqual(['2026-09-01', '2026-09-30']);
    expect(presetRange('next90', TODAY)).toEqual(['2026-10-11', '2027-01-08']);
    expect(presetRange('12m', TODAY)).toEqual(['2025-10-12', '2026-10-11']);
    expect(presetRange('fy', TODAY)).toEqual(['2026-04-01', '2027-03-31']);
    expect(presetRange('last', '2026-01-15')).toEqual(['2025-12-01', '2025-12-31']);
    expect(presetRange('month', '2028-02-10')).toEqual(['2028-02-01', '2028-02-29']);
  });

  it('starts the financial year on 1 April', () => {
    expect(fyStart('2027-03-31')).toBe('2026-04-01');
    expect(fyStart('2027-04-01')).toBe('2027-04-01');
  });
});

describe('the URL', () => {
  it('defaults to this FY, money, demo history on', () => {
    expect(parseReportParams({}, TODAY)).toEqual({
      preset: 'fy',
      from: '2026-04-01',
      to: '2027-03-31',
      demo: true,
      section: 'money',
    });
  });

  it('keeps a valid custom range and drops a broken one', () => {
    const ok = parseReportParams(
      { p: 'custom', from: '2026-01-01', to: '2026-03-31', demo: '0', s: 'funnel' },
      TODAY,
    );
    expect(ok).toMatchObject({
      preset: 'custom',
      from: '2026-01-01',
      demo: false,
      section: 'funnel',
    });
    for (const bad of [
      { p: 'custom', from: '2026-03-31', to: '2026-01-01' },
      { p: 'custom', from: '2026-02-30', to: '2026-03-01' },
      { p: 'custom', from: '2020-01-01', to: '2026-01-01' }, // wider than the api's three years
      { p: 'custom' },
    ]) {
      expect(parseReportParams(bad, TODAY).preset).toBe('fy');
    }
    expect(parseReportParams({ p: 'nope', s: 'nope' }, TODAY)).toMatchObject({
      preset: 'fy',
      section: 'money',
    });
  });

  it('writes only what differs from the default, and round-trips', () => {
    const p = parseReportParams({}, TODAY);
    expect(reportsHref(p)).toBe('/admin/reports');
    const href = reportsHref(p, { preset: '12m', demo: false, section: 'addons' });
    expect(href).toBe('/admin/reports?p=12m&demo=0&s=addons');
    const back = parseReportParams(
      Object.fromEntries(new URL(href, 'http://x').searchParams),
      TODAY,
    );
    expect(back).toMatchObject({
      preset: '12m',
      demo: false,
      section: 'addons',
      from: '2025-10-12',
    });
    expect(reportsHref(p, { preset: 'custom' })).toBe(
      '/admin/reports?p=custom&from=2026-04-01&to=2027-03-31',
    );
  });

  it('asks the api and the CSV for the same range', () => {
    const p = parseReportParams({ p: 'last', demo: '0' }, TODAY);
    expect(apiQuery(p)).toEqual({ from: '2026-09-01', to: '2026-09-30', demo: 'false' });
    expect(csvHref(p, 'cash')).toBe(
      '/api/admin/reports/cash.csv?from=2026-09-01&to=2026-09-30&demo=false',
    );
    expect(csvHref({ ...p, demo: true }, 'money')).not.toContain('demo');
  });
});

describe('numbers', () => {
  it('shortens money for tiles', () => {
    expect(lakh(41_54_800_00)).toBe('₹41.5 L');
    expect(lakh(2_30_00_000_00)).toBe('₹2.30 Cr');
    expect(lakh(48_000_00)).toBe('₹48,000');
    expect(lakh(-1_50_000_00)).toBe('−₹1.50 L');
  });

  it('writes percentages and changes', () => {
    expect(pct(1, 3)).toBe('33%');
    expect(pct(1, 40)).toBe('2.5%');
    expect(pct(1, 0)).toBe('—');
    expect(change(120, 100)).toEqual({ up: true, text: '+20%' });
    expect(change(80, 100)).toEqual({ up: false, text: '−20%' });
    expect(change(5, 0)).toBeNull();
  });

  it('labels months', () => {
    expect(monthLabel('2026-05')).toBe('May');
    expect(monthLabel('2026-05', true)).toBe('May ’26');
    expect(monthLong('2025-11')).toBe('Nov 2025');
  });
});
