// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedTrips } from '../src/components/site/account/SavedTrips';
import { SaveHeart } from '../src/components/site/saved/SaveHeart';
import { SavedToasts } from '../src/components/site/saved/SavedToasts';
import {
  MAX_GUEST,
  mergeGuestSaves,
  mergeNote,
  readGuest,
  resetSavedForTests,
} from '../src/lib/saved';

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const signedOut = () => json({ signedIn: false, slugs: [], max: 60 });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetSavedForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function heart(slug = 'munnar-tea-hills', name = 'Munnar Tea Hills') {
  return render(
    <>
      <SaveHeart slug={slug} name={name} variant="card" />
      <SavedToasts />
    </>,
  );
}

describe('the guest list in the browser', () => {
  it('cleans what it reads: valid slugs, no duplicates, capped', () => {
    const many = Array.from({ length: MAX_GUEST + 5 }, (_, i) => ({ slug: `trip-${i}`, at: 'x' }));
    localStorage.setItem(
      'ts:saved:v1',
      JSON.stringify([
        { slug: 'Bad Slug' },
        { slug: 'trip-0', at: '2026-10-01T10:00:00.000Z' },
        42,
        ...many,
      ]),
    );
    const list = readGuest();
    expect(list).toHaveLength(MAX_GUEST);
    expect(list[0]).toEqual({ slug: 'trip-0', at: '2026-10-01T10:00:00.000Z' });
    expect(new Set(list.map((g) => g.slug)).size).toBe(MAX_GUEST);
  });

  it('repairs what the api would refuse, so one bad entry never blocks the merge', () => {
    localStorage.setItem(
      'ts:saved:v1',
      JSON.stringify([
        { slug: 'a'.repeat(81), at: '2026-10-01T10:00:00Z' },
        { slug: 'goa-beaches', at: 'not a date' },
        { slug: 'munnar', at: '2026-10-01T10:00:00Z' },
      ]),
    );
    const [goa, munnar] = readGuest();
    expect(readGuest()).toHaveLength(2);
    expect(Number.isNaN(Date.parse(goa!.at))).toBe(false);
    expect(munnar).toEqual({ slug: 'munnar', at: '2026-10-01T10:00:00.000Z' });
  });

  it('survives garbage and blocked storage', () => {
    localStorage.setItem('ts:saved:v1', '{not json');
    expect(readGuest()).toEqual([]);
  });

  it('a guest save stays in the browser and says how to keep it', async () => {
    fetchMock.mockResolvedValue(signedOut());
    heart();
    const button = screen.getByRole('button', { name: 'Save Munnar Tea Hills' });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/account/saved',
        expect.objectContaining({ method: 'GET' }),
      ),
    );
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
    expect(readGuest().map((g) => g.slug)).toEqual(['munnar-tea-hills']);
    expect(await screen.findByText('Saved on this device — sign in to keep it')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      '/account/sign-in',
    );
    // Only GET went to the server: a guest's saves never leave the browser.
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === 'GET')).toBe(
      true,
    );

    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('false'));
    expect(readGuest()).toEqual([]);
  });
});

describe('signed in', () => {
  it('merges the guest list on load, then saves to the account', async () => {
    localStorage.setItem(
      'ts:saved:v1',
      JSON.stringify([{ slug: 'goa-beaches', at: '2026-10-01T10:00:00.000Z' }]),
    );
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/account/saved') return json({ slugs: [], max: 60 });
      if (url === '/api/account/saved/merge')
        return json({ slugs: ['goa-beaches'], max: 60, added: 1, leftOut: 0 });
      if (url === '/api/account/saved/munnar-tea-hills' && init.method === 'PUT')
        return json({ slugs: ['munnar-tea-hills', 'goa-beaches'], max: 60 });
      throw new Error(`unexpected ${url}`);
    });
    heart();
    await waitFor(() => expect(localStorage.getItem('ts:saved:v1')).toBeNull());
    const merged = fetchMock.mock.calls.find(([u]) => u === '/api/account/saved/merge');
    expect(JSON.parse(String((merged?.[1] as RequestInit).body))).toEqual({
      items: [{ slug: 'goa-beaches', at: '2026-10-01T10:00:00.000Z' }],
    });

    const button = screen.getByRole('button', { name: 'Save Munnar Tea Hills' });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
    expect(await screen.findByText('Saved Munnar Tea Hills')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('ts:saved:acct') ?? '[]')).toEqual([
      'munnar-tea-hills',
      'goa-beaches',
    ]);
  });

  it('rolls the heart back with the api message when a save is refused', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/account/saved') return json({ slugs: [], max: 60 });
      return json(
        {
          error: {
            code: 'conflict',
            message: 'You can keep 60 saved trips — remove one first',
            reason: 'saved_full',
          },
        },
        409,
      );
    });
    heart();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const button = screen.getByRole('button', { name: 'Save Munnar Tea Hills' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText('You can keep 60 saved trips — remove one first')).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the guest list when the merge fails, for the next page to retry', async () => {
    localStorage.setItem('ts:saved:v1', JSON.stringify([{ slug: 'goa-beaches', at: 'x' }]));
    fetchMock.mockResolvedValue(json({ error: { code: 'internal', message: 'down' } }, 502));
    expect(await mergeGuestSaves()).toBeUndefined();
    expect(readGuest()).toHaveLength(1);
  });

  it('treats a 200 that is not JSON as a failed merge, never a throw', async () => {
    localStorage.setItem('ts:saved:v1', JSON.stringify([{ slug: 'goa-beaches', at: 'x' }]));
    fetchMock.mockResolvedValue(new Response('<html>proxy</html>', { status: 200 }));
    await expect(mergeGuestSaves()).resolves.toBeUndefined();
    expect(readGuest()).toHaveLength(1);
  });

  it('a refused save rolls back that trip only, not another tapped meanwhile', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/account/saved') return Promise.resolve(json({ slugs: [], max: 60 }));
      if (url === '/api/account/saved/munnar-tea-hills')
        return new Promise<Response>((r) => {
          release = r;
        });
      if (url === '/api/account/saved/goa-beaches')
        return Promise.resolve(json({ slugs: ['goa-beaches'], max: 60 }));
      throw new Error(`unexpected ${url}`);
    });
    render(
      <>
        <SaveHeart slug="munnar-tea-hills" name="Munnar Tea Hills" variant="card" />
        <SaveHeart slug="goa-beaches" name="Goa Beaches" variant="card" />
        <SavedToasts />
      </>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const munnar = screen.getByRole('button', { name: 'Save Munnar Tea Hills' });
    const goa = screen.getByRole('button', { name: 'Save Goa Beaches' });
    fireEvent.click(munnar);
    await waitFor(() => expect(munnar.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(goa);
    await waitFor(() => expect(goa.getAttribute('aria-pressed')).toBe('true'));
    await act(async () => {
      release(json({ error: { code: 'internal', message: 'Try again' } }, 500));
    });
    await waitFor(() => expect(munnar.getAttribute('aria-pressed')).toBe('false'));
    expect(goa.getAttribute('aria-pressed')).toBe('true');
  });

  it('words the note the next page shows after a merge', () => {
    expect(mergeNote({ added: 1, leftOut: 0 })).toBe(
      '1 saved trip from this device is now on your account.',
    );
    expect(mergeNote({ added: 3, leftOut: 2 })).toBe(
      '3 saved trips from this device are now on your account. Your account keeps 60 saved trips, so 2 older ones were left out.',
    );
    expect(mergeNote({ added: 0, leftOut: 0 })).toBe('');
  });
});

const trip = (slug: string, name: string, next: { date: string; seatsLeft: number } | null) => ({
  savedAt: '2026-10-09T10:00:00Z',
  nextDeparture: next,
  card: {
    slug,
    name,
    destination: 'Kerala',
    nights: 4,
    days: 5,
    startingPricePaise: 24_999_00,
    themes: [],
    coverUrl: null,
    highlights: [],
    badge: null,
    deal: null,
    earlyBird: false,
    rating: null,
  },
});

describe('My trips · Saved', () => {
  it('lists the trips with the next open date, and removes one with Undo', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/account/saved') return json({ slugs: ['munnar', 'alleppey'], max: 60 });
      if (url === '/api/account/saved/munnar' && init.method === 'DELETE')
        return json({ slugs: ['alleppey'], max: 60 });
      if (url === '/api/account/saved/munnar' && init.method === 'PUT')
        return json({ slugs: ['munnar', 'alleppey'], max: 60 });
      throw new Error(`unexpected ${url}`);
    });
    render(
      <>
        <SavedTrips
          items={[
            trip('munnar', 'Munnar Tea Hills', { date: '2099-11-14', seatsLeft: 3 }),
            trip('alleppey', 'Alleppey Houseboat', null),
          ]}
        />
        <SavedToasts />
      </>,
    );
    expect(screen.getByText('3 seats left')).toBeTruthy();
    expect(screen.getByText('No dates on sale right now')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Munnar Tea Hills' }).getAttribute('href')).toBe(
      '/packages/munnar',
    );

    const munnar = screen.getByRole('button', { name: 'Save Munnar Tea Hills' });
    await waitFor(() => expect(munnar.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(munnar);
    expect(await screen.findByText('Removed Munnar Tea Hills')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Munnar Tea Hills' })).toBeNull(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('link', { name: 'Munnar Tea Hills' })).toBeTruthy();
  });

  it('has an empty state that points at the trips', () => {
    fetchMock.mockResolvedValue(json({ slugs: [], max: 60 }));
    render(<SavedTrips items={[]} />);
    expect(screen.getByText('Nothing saved yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse trips' }).getAttribute('href')).toBe(
      '/packages',
    );
  });
});
