import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GST_STATES, GSTIN_RE } from '../src/lib/gst';
import { nth } from './nth';

// Q-5: the GSTIN rule and the State codes are checked in the browser before the api re-checks
// them, so they are mirrored rather than fetched; these tests read the api's own source and fail
// the moment the two disagree.
const API = resolve(__dirname, '../../api/app');
const source = (file: string) => readFileSync(resolve(API, file), 'utf8');

describe('GST rules match the api', () => {
  it('uses the api’s GSTIN pattern, character for character', () => {
    const m = source('schemas/bookings.py').match(/^GSTIN_RE = re\.compile\(r"(.+)"\)$/m);
    expect(m, 'GSTIN_RE not found in schemas/bookings.py').not.toBeNull();
    expect(GSTIN_RE.source).toBe(nth(m!, 1));
    expect(GSTIN_RE.flags).toBe('');
  });

  it('lists the api’s States and codes', () => {
    const block = source('services/gst/tax.py').match(
      /^STATES: dict\[str, str\] = \{\n([\s\S]+?)\n\}/m,
    );
    expect(block, 'STATES not found in services/gst/tax.py').not.toBeNull();
    const api = Object.fromEntries(
      [...nth(block!, 1).matchAll(/^\s+"([^"]+)": "(\d{2})",$/gm)].map((e) => [
        nth(e, 1),
        nth(e, 2),
      ]),
    );
    expect(Object.keys(api).length).toBeGreaterThan(30);
    expect(GST_STATES).toEqual(api);
  });
});
