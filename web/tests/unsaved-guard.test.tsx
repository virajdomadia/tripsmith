// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { UnsavedChangesProvider, useConfirmLeave, useUnsavedChangesGuard } =
  await import('../src/lib/admin/unsaved');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Editor({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty);
  const confirmLeave = useConfirmLeave();
  return (
    <>
      {/* A plain anchor on purpose: the guard catches clicks on any in-site link. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/admin/packages">Packages</a>
      <a href="https://example.com/">Elsewhere</a>
      <button type="button" onClick={() => confirmLeave(() => push('/admin/destinations'))}>
        Cancel
      </button>
    </>
  );
}

const renderEditor = (dirty: boolean) =>
  render(
    <UnsavedChangesProvider>
      <Editor dirty={dirty} />
    </UnsavedChangesProvider>,
  );

describe('unsaved-changes guard', () => {
  it('asks before an in-site link leaves a dirty form, and goes on Discard', async () => {
    const user = userEvent.setup();
    renderEditor(true);
    await user.click(screen.getByRole('link', { name: 'Packages' }));
    expect(screen.getByRole('alertdialog', { name: 'Leave without saving?' })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(push).toHaveBeenCalledWith('/admin/packages');
  });

  it('stays put on Keep editing', async () => {
    const user = userEvent.setup();
    renderEditor(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it('lets a clean form navigate without asking', async () => {
    const user = userEvent.setup();
    renderEditor(false);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(push).toHaveBeenCalledWith('/admin/destinations');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('arms the browser prompt only while dirty', () => {
    const { rerender } = renderEditor(true);
    const armed = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(armed);
    expect(armed.defaultPrevented).toBe(true);

    rerender(
      <UnsavedChangesProvider>
        <Editor dirty={false} />
      </UnsavedChangesProvider>,
    );
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });

  it('leaves off-site links to the browser prompt', async () => {
    renderEditor(true);
    const link = screen.getByRole('link', { name: 'Elsewhere' });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    // jsdom does not navigate; stop the default so the test page stays put either way.
    link.addEventListener('click', (e) => e.preventDefault());
    link.dispatchEvent(click);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
