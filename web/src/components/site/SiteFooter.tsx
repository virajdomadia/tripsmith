import { BrandMark } from './BrandMark';
import { Container } from './Container';

/** Compact footer; F6/F8 expand it (address, phone, WhatsApp, policy links). No year: static pages would bake it in. */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-bg2">
      <Container className="flex flex-wrap items-center justify-between gap-3 py-8 text-sm text-mute">
        <span className="flex items-center gap-2 font-extrabold text-ink">
          <BrandMark size={22} />
          Tripsmith
        </span>
        <small>© Tripsmith · Domestic holidays across India.</small>
      </Container>
    </footer>
  );
}
