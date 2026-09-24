// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { EnquiryForm } = await import('../src/components/site/enquiry/EnquiryForm');

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** No jest-dom here: the accessible description, spelled out (aria-describedby → text). */
const description = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
const disabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
const checked = (el: HTMLElement) => (el as HTMLInputElement).checked;

const months = [{ value: '2026-11', label: 'November 2026' }];
const pkg = { slug: 'north-goa-beaches', name: 'North Goa Beaches' };

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), 'Priya Rao');
  await user.type(screen.getByLabelText('Mobile number'), '9845022110');
  await user.type(screen.getByLabelText('Email'), 'priya@example.com');
}

describe('EnquiryForm', () => {
  it('stays busy after a successful send, until the thanks page takes over', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ref: 'TS-ABC234', firstName: 'Priya', package: pkg, emailed: false }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    render(<EnquiryForm kind="package" pkg={pkg} months={months} />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }));

    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    expect(push.mock.calls[0][0]).toMatch(/^\/enquiry\/thanks\?ref=TS-ABC234/);
    // The button must not come back to life for a second click while /enquiry/thanks loads.
    const button = screen.getByRole('button', { name: 'Sending…' });
    expect(disabled(button)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(disabled(button)).toBe(true);
  });

  it('re-enables after a server error so the visitor can retry', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'internal', message: 'x' } }), { status: 500 }),
    );
    render(<EnquiryForm kind="contact" months={months} />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong/);
    expect(disabled(screen.getByRole('button', { name: 'Send message' }))).toBe(false);
  });

  it('moves focus to the first invalid field and links each error to its control', async () => {
    const user = userEvent.setup();
    render(<EnquiryForm kind="contact" months={months} />);
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const name = screen.getByLabelText('Your name');
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(description(name)).toBe('Enter your name');
    expect(description(screen.getByLabelText('Email'))).toBe('Enter a valid email address');
    // One error each, none of them shouting over the others.
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('describes the phone field with its hint while it is valid', () => {
    render(<EnquiryForm kind="contact" months={months} />);
    expect(description(screen.getByLabelText('Mobile number'))).toBe('We call this number');
  });

  it('offers Standard / Customise as a radio group that posts the type', async () => {
    const user = userEvent.setup();
    render(<EnquiryForm kind="package" pkg={pkg} months={months} />);
    const group = screen.getByRole('group', { name: 'Enquiry type' });
    const standard = screen.getByRole('radio', { name: 'Standard trip' });
    const custom = screen.getByRole('radio', { name: 'Customise this trip' });
    expect(group.contains(standard)).toBe(true);
    expect(checked(standard)).toBe(true);
    expect(screen.queryByLabelText('Budget per person (₹)')).toBeNull();

    await user.click(custom);
    expect(checked(custom)).toBe(true);
    expect(description(screen.getByLabelText('Budget per person (₹)'))).toBe(
      'Between ₹1,000 and ₹1,000,000 per person',
    );
    // Arrow keys move between native radios.
    await user.keyboard('{ArrowLeft}');
    expect(checked(standard)).toBe(true);
  });

  it('says plainly that this is a demo, and no longer promises privacy it cannot keep', () => {
    render(<EnquiryForm kind="contact" months={months} />);
    expect(screen.getByText(/This is a portfolio demo/)).toBeTruthy();
    expect(screen.queryByText(/never share your number/)).toBeNull();
  });
});
