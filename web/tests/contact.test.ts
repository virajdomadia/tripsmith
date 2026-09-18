import { describe, expect, it } from 'vitest';
import { contactMessage } from '../src/lib/contact';

describe('contactMessage', () => {
  it('writes a WhatsApp-ready message from the form fields', () => {
    expect(
      contactMessage({
        name: 'Asha',
        mobile: '9876543210',
        email: 'asha@example.com',
        message: 'Goa for 4 in December, around 60k.',
      }),
    ).toBe(
      'Hi Tripsmith, this is Asha.\nGoa for 4 in December, around 60k.\nMobile: 9876543210 · Email: asha@example.com',
    );
  });

  it('leaves out blank fields and trims the rest', () => {
    expect(contactMessage({ name: ' Asha ', mobile: '', email: '', message: ' Hello ' })).toBe(
      'Hi Tripsmith, this is Asha.\nHello',
    );
    expect(contactMessage({ name: '', mobile: '', email: '', message: '' })).toBe('Hi Tripsmith.');
  });
});
