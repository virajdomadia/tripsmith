import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The K · Ocean + Marigold tokens locked in S12 (docs/04-ui-mockups.md, design tokens table).
const K: Record<string, string> = {
  '--color-bg': '#ffffff',
  '--color-bg2': '#f3f6fc',
  '--color-ink': '#14202a',
  '--color-ink2': '#3b4148',
  '--color-mute': '#5e6b76',
  '--color-line': '#e3e8ec',
  '--color-primary': '#1b4fd8',
  '--color-primary-ink': '#143ead',
  '--color-action': '#f2a93b',
  '--color-action-ink': '#d98f1f',
  '--color-ok': '#1f7a4d',
  '--color-warn': '#b5541e',
  '--color-wa': '#25d366',
  '--radius-btn': '12px',
  '--radius-card': '18px',
  '--radius-chip': '999px',
};

const css = readFileSync(resolve(__dirname, '../src/app/globals.css'), 'utf8').toLowerCase();

/** `name: value;` with any whitespace, as one declaration line. */
const declaration = (name: string, value: string) =>
  new RegExp(`${name}\\s*:\\s*${value.replace('.', '\\.')}\\s*;`);

describe('globals.css locks the K tokens', () => {
  it('declares every token with the documented value inside @theme', () => {
    expect(css).toMatch(/@theme\s*\{/);
    for (const [name, value] of Object.entries(K)) {
      expect(css, name).toMatch(declaration(name, value));
    }
  });

  it('uses DM Sans through the next/font variable and no other family', () => {
    expect(css).toContain('--font-sans: var(--font-dm-sans)');
    expect(css).not.toMatch(/newsreader|fraunces|georgia|instrument/);
  });
});
