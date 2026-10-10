// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BLANK_MEET,
  blankDeparture,
  emptyPackage,
  packageSchema,
  toInput,
} from '../src/lib/admin/package-schema';
import { PackStatusPanel } from '../src/components/admin/bookings/PackStatusPanel';

/** P10b — the owner's side of R48: the trip pack settings and a date's own meeting point on the
 * wire, the form's rules, and booking detail C's pack + calendar status. */

afterEach(cleanup);

const base = () => ({
  ...emptyPackage('d-goa'),
  slug: 'north-goa',
  name: 'North Goa',
  summary: 'Three nights on the quieter Vagator side of North Goa, with time to do nothing.',
});

describe('package form → wire', () => {
  it('sends the meeting point, the notes, the hotels’ contacts and a date’s own point', () => {
    const v = packageSchema.parse({
      ...base(),
      meetPlace: ' Dabolim Airport ',
      meetTime: '12:00',
      meetMapsUrl: 'https://maps.app.goo.gl/x',
      meetNote: '',
      kbWeather: 'Hot.',
      kbCash: '',
      hotels: [
        {
          name: 'Lemon Tree',
          city: 'Candolim',
          stars: 4,
          nights: 3,
          address: '',
          phone: '+91 832',
        },
      ],
      departures: [
        { ...blankDeparture(), date: '2099-11-13', ...BLANK_MEET },
        { ...blankDeparture(), date: '2099-11-20', meetPlace: 'Thivim station', meetTime: '09:30' },
      ],
    });
    const body = toInput(v);
    expect(body.tripPack).toEqual({
      meeting: {
        place: 'Dabolim Airport',
        time: '12:00',
        mapsUrl: 'https://maps.app.goo.gl/x',
        note: null,
      },
      knowBefore: { weather: 'Hot.', network: '', cash: '', rules: '', packing: '' },
    });
    expect(body.hotels![0]).toMatchObject({ address: null, phone: '+91 832' });
    expect(body.departures![0]).toMatchObject({ meeting: null });
    expect(body.departures![1]!.meeting).toEqual({
      place: 'Thivim station',
      time: '09:30',
      mapsUrl: null,
      note: null,
    });
    expect(body.departures![1]).not.toHaveProperty('meetPlace');
  });

  it('wants an https Maps link and a place before anything else', () => {
    const bad = packageSchema.safeParse({
      ...base(),
      meetPlace: 'Dabolim',
      meetMapsUrl: 'http://x',
    });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.path.join('.'))).toContain('meetMapsUrl');
    const noPlace = packageSchema.safeParse({ ...base(), meetTime: '09:00' });
    expect(noPlace.error!.issues.map((i) => [i.path.join('.'), i.message])).toContainEqual([
      'meetPlace',
      'Add the place first',
    ]);
    const dateNoPlace = packageSchema.safeParse({
      ...base(),
      departures: [{ ...blankDeparture(), date: '2099-11-13', meetNote: 'Bus 4' }],
    });
    expect(dateNoPlace.error!.issues.map((i) => i.path.join('.'))).toContain(
      'departures.0.meetPlace',
    );
  });
});

describe('PackStatusPanel', () => {
  const pack = {
    state: 'locked' as const,
    opensOn: '2099-11-06',
    needsPayment: true,
    dayReached: false,
    readAt: null,
    content: null,
  };

  it('a locked pack on a deposit, with the preview PDF; the calendar not added', () => {
    render(
      <PackStatusPanel
        bookingRef="TB-7K2M9Q"
        status={{ pack, calendarAddedAt: null, calendarVia: null, calendarStale: false }}
      />,
    );
    expect(screen.getByText(/Locked · opens Fri 6 Nov 2099, once paid in full/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Preview the PDF/ }).getAttribute('href')).toBe(
      '/api/account/bookings/TB-7K2M9Q/trip-pack.pdf',
    );
    expect(screen.getByText(/Not added yet/)).toBeTruthy();
  });

  it('an open, read pack; a calendar un-ticked by a date change', () => {
    render(
      <PackStatusPanel
        bookingRef="TB-7K2M9Q"
        status={{
          pack: { ...pack, state: 'open', needsPayment: false, readAt: '2099-11-07T05:00:00Z' },
          calendarAddedAt: null,
          calendarVia: 'google',
          calendarStale: true,
        }}
      />,
    );
    expect(screen.getByText(/Open · read Sat 7 Nov 2099/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Their PDF/ })).toBeTruthy();
    expect(screen.getByText(/Date changed — not added again yet/)).toBeTruthy();
  });

  it('past the day on a deposit: waiting for the balance', () => {
    render(
      <PackStatusPanel
        bookingRef="TB-7K2M9Q"
        status={{
          pack: { ...pack, dayReached: true },
          calendarAddedAt: '2099-10-01T05:00:00Z',
          calendarVia: 'ics',
          calendarStale: false,
        }}
      />,
    );
    expect(screen.getByText(/Locked — waiting for the balance/)).toBeTruthy();
    expect(screen.getByText(/Added · calendar file · Thu 1 Oct 2099/)).toBeTruthy();
  });
});
