import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';

/**
 * The OG card (F13, R7): 1200×630, cover full-bleed under an ocean-ink gradient, the brand mark,
 * a name, a fact line and a marigold from-price. Satori renders a CSS subset — every style here
 * is inline flex, no Tailwind, no `gap` on inline elements — and needs TTF fonts (DM Sans from
 * api/assets/fonts, OFL).
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;
/** JPEG, not satori's PNG: a photo card is ~1 MB as PNG and WhatsApp drops previews over ~300 KB. */
export const OG_CONTENT_TYPE = 'image/jpeg';
const JPEG_QUALITY = 82;
/** Matches the page's hourly ISR (lib/catalog): prices and departures move at most that often. */
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';

// K tokens (globals.css), inlined because satori never sees the stylesheet.
const INK = '#14202a';
const OCEAN = '#1b4fd8';
const MARIGOLD = '#f2a93b';

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 700 }[]> | undefined;

/**
 * Both weights, read once per lambda. `join(process.cwd(), <literal>)` is what Next's file
 * tracing follows, so the TTFs ship with the function (`new URL(…, import.meta.url)` becomes an
 * unfetchable `/_next/static` path under the Node runtime).
 */
function fonts() {
  const dir = join(process.cwd(), 'src/lib/og/fonts');
  fontsPromise ??= Promise.all([
    readFile(join(dir, 'DMSans-Regular.ttf')),
    readFile(join(dir, 'DMSans-Bold.ttf')),
  ])
    .then(([regular, bold]) => [
      { name: 'DM Sans', data: regular, weight: 400 as const },
      { name: 'DM Sans', data: bold, weight: 700 as const },
    ])
    .catch((err: unknown) => {
      fontsPromise = undefined; // never memoise a failed read for the lambda's lifetime
      throw err;
    });
  return fontsPromise;
}

export type OgCard = {
  /** Public cover URL (Vercel Blob); satori fetches it. Absent → the ocean ground alone. */
  cover?: string | null;
  name: string;
  /** `3N / 4D · Goa · from Bengaluru` or a destination tagline. */
  line: string;
  /** `From ₹14,999` — omitted when every departure is on request. */
  price?: string | null;
  /** Bottom-right caption: the canonical host. */
  site: string;
};

function BrandMark() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" style={{ borderRadius: 14, background: OCEAN }}>
      <path
        d="M14 44C22 44 22 26 32 26s10 14 18-4"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="6 6"
      />
      <circle cx="50" cy="22" r="6" fill={MARIGOLD} />
      <circle cx="14" cy="44" r="4" fill="#fff" />
    </svg>
  );
}

export async function ogCard(card: OgCard): Promise<Response> {
  const png = await renderPng(card);
  const jpeg = await sharp(png).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { 'Content-Type': OG_CONTENT_TYPE, 'Cache-Control': CACHE_CONTROL },
  });
}

async function renderPng(card: OgCard): Promise<Buffer> {
  const res = new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: OCEAN,
        fontFamily: 'DM Sans',
        color: '#fff',
      }}
    >
      {card.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- satori, not the DOM
        <img
          src={card.cover}
          alt=""
          width={OG_SIZE.width}
          height={OG_SIZE.height}
          style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }}
        />
      )}
      {/* Explicit box, not `inset`: satori ignores the shorthand and the overlay never paints. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          background:
            'linear-gradient(180deg, rgba(20,32,42,0.55) 0%, rgba(20,32,42,0.05) 30%, rgba(20,32,42,0.18) 58%, rgba(20,32,42,0.9) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 56,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <BrandMark />
        <span style={{ marginLeft: 16, fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>
          Tripsmith
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          bottom: 52,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            fontSize: card.name.length > 26 ? 60 : 72,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            textShadow: '0 2px 24px rgba(0,0,0,0.35)',
          }}
        >
          {card.name}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 22,
            fontSize: 28,
            fontWeight: 400,
            opacity: 0.95,
          }}
        >
          {card.price && (
            <span
              style={{
                display: 'flex',
                padding: '10px 22px',
                marginRight: 22,
                borderRadius: 999,
                background: MARIGOLD,
                color: INK,
                fontWeight: 700,
                fontSize: 30,
              }}
            >
              {card.price}
            </span>
          )}
          <span>{card.line}</span>
          <span style={{ marginLeft: 'auto', fontSize: 24, opacity: 0.8 }}>{card.site}</span>
        </div>
      </div>
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
  return Buffer.from(await res.arrayBuffer());
}
