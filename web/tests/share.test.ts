import { describe, expect, it } from 'vitest';
import { shareText, whatsappShareHref } from '../src/lib/share';

const url = 'https://tripsmith.vercel.app/packages/north-goa-beaches';

describe('share helpers', () => {
  it('share text is the name, the duration/destination line and the URL', () => {
    expect(shareText('North Goa Beaches', '3N / 4D · Goa', url)).toBe(
      `North Goa Beaches — 3N / 4D · Goa\n${url}`,
    );
  });

  it('whatsapp share goes to a contact (no number) with the text encoded once', () => {
    const text = shareText('North Goa Beaches', '3N / 4D · Goa', url);
    const href = whatsappShareHref(text);
    expect(href).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
    expect(href).not.toMatch(/wa\.me\/\d/);
    expect(decodeURIComponent(href).split(url).length - 1).toBe(1);
  });
});
