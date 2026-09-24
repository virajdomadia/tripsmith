import { BUSINESS } from '@/lib/business';

/** Keyless Google Maps embed (S9), lazy so it costs nothing until scrolled to. */
export function MapEmbed() {
  return (
    <div className="mt-6 overflow-hidden rounded-card border border-line bg-bg2">
      <iframe
        title={`Map: ${BUSINESS.address}, ${BUSINESS.city}`}
        src={BUSINESS.mapEmbedSrc}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className="block h-[300px] w-full"
      />
    </div>
  );
}
