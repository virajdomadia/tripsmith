export const THEMES = ['beach', 'hills', 'honeymoon', 'family', 'adventure', 'heritage'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, string> = {
  beach: 'Beach',
  hills: 'Hills',
  honeymoon: 'Honeymoon',
  family: 'Family',
  adventure: 'Adventure',
  heritage: 'Heritage',
};
export const PACKAGE_STATUSES = ['draft', 'live'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];
export const OCCUPANCIES = ['double', 'triple', 'single', 'child'] as const;
export const USER_ROLES = ['owner', 'customer'] as const;
export const ENQUIRY_TYPES = [
  'standard',
  'custom',
  'contact',
  'callback',
  'group',
  'chat-handoff',
] as const;
export const ENQUIRY_STATUSES = ['new', 'contacted', 'converted', 'closed'] as const;
export const EMAIL_STATUSES = ['sent', 'failed', 'skipped'] as const;
export const BADGES = ['filling-fast', 'sold-out', 'guaranteed'] as const;
export type Badge = (typeof BADGES)[number];
export const BADGE_LABELS: Record<Badge, string> = {
  'filling-fast': 'Filling fast',
  'sold-out': 'Sold out',
  guaranteed: 'Guaranteed',
};
export const SORTS = ['price-asc', 'price-desc', 'duration'] as const;
export type Sort = (typeof SORTS)[number];
export const LIMITS = {
  maxThemesPerPackage: 3,
  maxPartySize: 12,
  fillingFastSeats: 4,
  relatedPackages: 3,
  maxImagesPerPackage: 12,
} as const;
export const INDIAN_MOBILE = /^[6-9]\d{9}$/;
export const SLUG_RE = /^[a-z0-9-]+$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
