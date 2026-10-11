import type { CalendarDeparture, CalendarPackage } from '../src/lib/admin/calendar';

/** P11 fixtures shared by the calendar tests. */

export const dep = (over: Partial<CalendarDeparture> = {}): CalendarDeparture => ({
  id: 'd1',
  packageId: 'p1',
  date: '2099-11-06',
  returns: '2099-11-09',
  leaderId: null,
  seatsTotal: 20,
  sold: 10,
  held: 2,
  free: 8,
  waiting: 0,
  smallestWaitingParty: null,
  guaranteed: false,
  priceDoublePaise: 6_499_00,
  revenuePaise: 64_990_00,
  collectedPaise: 50_000_00,
  balancePaise: 14_990_00,
  balanceBookings: 1,
  firstDueOn: '2099-10-07',
  missingTravellers: 0,
  readyPercent: 60,
  ...over,
});

export const pkg = (over: Partial<CalendarPackage> = {}): CalendarPackage => ({
  id: 'p1',
  name: 'Kasol Weekend Camp',
  destinationId: 'x1',
  destinationName: 'Himachal',
  nights: 3,
  draft: false,
  leaderId: null,
  seatsTotal: 20,
  priceDoublePaise: 6_499_00,
  priceTriplePaise: 5_999_00,
  priceChildPaise: 3_499_00,
  singleSupplementPaise: 2_000_00,
  ...over,
});
