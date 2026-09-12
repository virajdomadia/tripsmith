import type { Badge, Theme } from '../constants';

export type ImageView = { url: string; alt: string; width: number; height: number };
export type PackageCard = {
  slug: string;
  name: string;
  destination: { slug: string; name: string };
  nights: number;
  days: number;
  startingPricePaise: number | null;
  themes: Theme[];
  cover: ImageView | null;
  highlights: string[];
  hotelStars: number;
  hotelName: string;
  badge: Badge | null;
  nextDeparture: string | null; // ISO date
};
export type DepartureView = {
  id: string;
  date: string;
  seatsTotal: number;
  seatsLeft: number;
  guaranteed: boolean;
  priceDoublePaise: number;
  priceTriplePaise: number;
  priceChildPaise: number;
  singleSupplementPaise: number;
  badge: Badge | null;
};
export type ItineraryDayView = {
  dayNo: number;
  title: string;
  description: string;
  meals: { b: boolean; l: boolean; d: boolean };
  stay: string | null;
};
export type HotelView = { name: string; city: string; stars: number; nights: number };
export type PackageDetail = Omit<PackageCard, 'cover'> & {
  summary: string;
  departureCity: string;
  inclusions: string[];
  exclusions: string[];
  hotels: HotelView[];
  faq: { q: string; a: string }[];
  images: ImageView[];
  itinerary: ItineraryDayView[];
  departures: DepartureView[];
  related: PackageCard[];
  updatedAt: string;
};
export type SearchResult = { items: PackageCard[]; total: number };
export type DestinationSummary = {
  slug: string;
  name: string;
  tagline: string;
  cover: ImageView | null;
  packageCount: number;
  startingPricePaise: number | null;
};
export type DestinationDetail = DestinationSummary & {
  intro: string;
  region: string;
  bestMonths: number[];
  packages: PackageCard[];
};
