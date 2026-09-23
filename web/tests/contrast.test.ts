import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * H3: the token pairs the site paints text with, each held to WCAG AA (4.5:1 for body text).
 * Lighthouse only catches the pairs that happen to be on screen during a run — an error banner
 * or a "filling fast" badge is invisible to it — so the ratios are asserted from the tokens
 * themselves. Two tokens moved to get this green: `--color-wa` (white on the WhatsApp brand
 * green was 1.98:1) and `--color-warn` (warn text on `--color-warn-soft` was 4.44:1).
 */

const css = readFileSync(resolve(__dirname, '../src/app/globals.css'), 'utf8');

/** Reads a `--color-*: #rrggbb;` declaration out of the `@theme` block. */
function token(name: string): string {
  const hit = new RegExp(`--color-${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(css);
  if (!hit) throw new Error(`globals.css declares no --color-${name}`);
  return hit[1].toLowerCase();
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';

/** [description, foreground, background] — every combination a site component actually renders. */
const PAIRS: Array<[string, string, string]> = [
  ['WhatsApp buttons (FAB, callback band, thanks page, mobile CTA)', WHITE, token('wa')],
  ['primary buttons and the price pill', WHITE, token('primary')],
  ['the callback band gradient at its dark end', WHITE, token('primary-ink')],
  ['the marigold search button', token('ink'), token('action')],
  ['the marigold button on hover', token('ink'), token('action-ink')],
  ['secondary copy on the page', token('mute'), token('bg')],
  ['secondary copy on tinted surfaces', token('mute'), token('bg2')],
  ['body copy', token('ink2'), token('bg')],
  ['links and icons', token('primary'), token('bg')],
  ['links on tinted surfaces', token('primary'), token('bg2')],
  ['active filter chips', token('primary'), token('primary-soft')],
  ['form error banners and the "filling fast" badge', token('warn'), token('warn-soft')],
  ['the "guaranteed" badge', token('ok'), token('ok-soft')],
  ['the active section-nav pill', WHITE, token('ink')],
  ['the admin sidebar', token('ink-soft'), token('ink')],
];

describe('token pairs meet WCAG AA', () => {
  it.each(PAIRS)('%s', (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the WhatsApp glow shadow on the untouched brand green', () => {
    // The buttons darkened; their shadow still carries #25d366 (docs/04 token table).
    const fab = readFileSync(
      resolve(__dirname, '../src/components/site/whatsapp/WhatsAppFab.tsx'),
      'utf8',
    );
    expect(fab).toContain('rgb(37_211_102');
  });
});
