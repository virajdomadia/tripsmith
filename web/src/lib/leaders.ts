/**
 * Trip leaders (R41, P3): the drawn monogram for a leader without a photo. Nothing is stored —
 * the initials come from the name and the colour from the slug, so the same leader always gets
 * the same avatar on the card, the departure row, their page and the admin.
 */

/** Six site-token pairs (fill, letters); every pair passes 4.5:1. */
export const MONOGRAM_TONES = [
  { fill: 'var(--color-primary)', ink: '#ffffff' },
  { fill: 'var(--color-ok)', ink: '#ffffff' },
  { fill: 'var(--color-warn)', ink: '#ffffff' },
  { fill: 'var(--color-ink)', ink: 'var(--color-action)' },
  { fill: 'var(--color-primary-soft)', ink: 'var(--color-primary-ink)' },
  { fill: 'var(--color-eb-soft)', ink: 'var(--color-eb)' },
] as const;

/** A small stable hash of the slug (FNV-1a), so a rename that keeps the slug keeps the colour. */
export function toneOf(slug: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return MONOGRAM_TONES[(h >>> 0) % MONOGRAM_TONES.length]!;
}

/** First and last word's first letter: "Rohan D'Souza" → "RD", "Meera" → "M". */
export function initialsOf(name: string) {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

/** "English, Hindi" in a box ↔ the api's list. */
export const splitTags = (text: string) =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
export const joinTags = (tags: readonly string[]) => tags.join(', ');
