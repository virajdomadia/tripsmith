export type ContactFields = { name: string; mobile: string; email: string; message: string };

/**
 * The contact form's stand-in until the enquiry flow lands: the fields become one WhatsApp
 * message, so a visitor's message still reaches a person today. Blank fields are left out.
 */
export function contactMessage(f: ContactFields): string {
  const name = f.name.trim();
  const lines = [name ? `Hi Tripsmith, this is ${name}.` : 'Hi Tripsmith.'];
  if (f.message.trim()) lines.push(f.message.trim());
  const reach = [
    f.mobile.trim() && `Mobile: ${f.mobile.trim()}`,
    f.email.trim() && `Email: ${f.email.trim()}`,
  ].filter(Boolean);
  if (reach.length) lines.push(reach.join(' · '));
  return lines.join('\n');
}
