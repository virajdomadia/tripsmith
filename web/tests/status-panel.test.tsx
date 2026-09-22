// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusPanel } from '../src/components/admin/packages/StatusPanel';
import type { components } from '../src/lib/api-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => '/admin/packages/p1',
}));

const adminRequest = vi.fn();
vi.mock('../src/lib/admin/client', () => ({
  adminRequest: (...args: unknown[]) => adminRequest(...args),
}));

afterEach(cleanup);
beforeEach(() => {
  adminRequest.mockReset();
  refresh.mockReset();
});

type AdminPackage = components['schemas']['AdminPackage'];
type PublishRule = components['schemas']['PublishRule'];
type RuleKey = PublishRule['key'];

const LABELS: Record<RuleKey, string> = {
  images: 'At least one photo',
  itinerary: 'Full itinerary',
  departures: 'At least one upcoming departure',
  prices: 'Prices set for every departure',
};

const rule = (key: RuleKey, ok: boolean, detail: string): PublishRule => ({
  key,
  ok,
  detail,
  label: LABELS[key],
});

const pkg = (over: Partial<AdminPackage> = {}) =>
  ({
    id: 'p1',
    slug: 'north-goa-beaches',
    status: 'draft',
    canPublish: true,
    publishRules: [
      rule('images', true, '4 uploaded'),
      rule('itinerary', true, '4 of 4 days written'),
      rule('departures', true, '3 upcoming'),
      rule('prices', true, 'All departures priced'),
    ],
    ...over,
  }) as AdminPackage;

describe('StatusPanel', () => {
  it('lists every rule with its detail', () => {
    render(<StatusPanel pkg={pkg()} />);
    expect(screen.getByText('At least one photo')).toBeDefined();
    expect(screen.getByText('4 of 4 days written')).toBeDefined();
    expect(screen.getByText('3 upcoming')).toBeDefined();
  });

  it('disables publishing while a rule fails and says why', () => {
    const blocked = pkg({
      canPublish: false,
      publishRules: [
        rule('images', false, 'No photos yet'),
        rule('itinerary', true, '4 of 4 days written'),
        rule('departures', true, '3 upcoming'),
        rule('prices', true, 'All departures priced'),
      ],
    });
    render(<StatusPanel pkg={blocked} />);
    expect(screen.getByRole('button', { name: /publish/i })).toHaveProperty('disabled', true);
    expect(screen.getByText('No photos yet')).toBeDefined();
  });

  it('publishes a ready draft', async () => {
    const user = userEvent.setup();
    adminRequest.mockResolvedValueOnce({});
    render(<StatusPanel pkg={pkg()} />);
    await user.click(screen.getByRole('button', { name: /publish/i }));
    expect(adminRequest).toHaveBeenCalledWith('/admin/packages/p1/status', {
      method: 'POST',
      body: { status: 'live' },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('offers unpublish for a live package regardless of the rules', async () => {
    const user = userEvent.setup();
    adminRequest.mockResolvedValueOnce({});
    render(<StatusPanel pkg={pkg({ status: 'live', canPublish: false })} />);
    const button = screen.getByRole('button', { name: /unpublish/i });
    expect(button).toHaveProperty('disabled', false);
    await user.click(button);
    expect(adminRequest).toHaveBeenCalledWith('/admin/packages/p1/status', {
      method: 'POST',
      body: { status: 'draft' },
    });
  });

  it('marks each rule as done or not for screen readers', () => {
    const blocked = pkg({
      canPublish: false,
      publishRules: [
        rule('images', false, 'No photos yet'),
        rule('itinerary', true, '4 of 4 days written'),
        rule('departures', true, '3 upcoming'),
        rule('prices', true, 'All departures priced'),
      ],
    });
    render(<StatusPanel pkg={blocked} />);
    expect(screen.getByLabelText('At least one photo: not done')).toBeDefined();
    expect(screen.getByLabelText('Full itinerary: done')).toBeDefined();
  });
});
