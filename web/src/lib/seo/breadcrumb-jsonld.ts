import { absolute } from './site-url';

export interface Crumb {
  /** What the visible trail says. */
  name: string;
  /** Site-relative; the last crumb is the page itself. */
  path: string;
}

/**
 * schema.org `BreadcrumbList` for the trail a page already renders (H1).
 *
 * It mirrors the visible `<nav aria-label="Breadcrumb">` on purpose: a breadcrumb rich result
 * that disagrees with the page is a structured-data error, not a feature. Build both from the
 * same array wherever a page has one.
 */
export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absolute(c.path),
    })),
  };
}
