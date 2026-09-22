// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../src/lib/api-errors';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/destinations/d1',
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

vi.mock('next/image', () => ({
  // Strip the DOM-unknown next/image props; keep `alt` (and everything else) so React doesn't
  // warn about unknown attributes and jsx-a11y sees a real alt.
  default: ({ fill, sizes, priority, alt, ...rest }: Record<string, unknown>) => {
    void fill;
    void sizes;
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt as string} {...rest} />;
  },
}));

const uploadCover = vi.fn();
vi.mock('@/lib/admin/client', () => ({ uploadCover, adminRequest: vi.fn() }));

const { CoverUploader } = await import('../src/components/admin/destinations/CoverUploader');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type=file]') as HTMLInputElement;
}

describe('CoverUploader', () => {
  it('shows Upload and the format hint when empty', () => {
    render(<CoverUploader value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Upload/ })).toBeTruthy();
    expect(screen.getByText(/JPG\/PNG\/WEBP ≤ 4 MB/)).toBeTruthy();
  });

  it('shows Replace cover and a preview when a url is set', () => {
    const { container } = render(
      <CoverUploader value="https://blob.test/cover.jpg" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Replace cover/ })).toBeTruthy();
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://blob.test/cover.jpg');
  });

  it('uploads a picked file and reports the returned url', async () => {
    uploadCover.mockResolvedValue({ url: 'https://blob.test/new.jpg', width: 10, height: 10 });
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<CoverUploader value="" onChange={onChange} />);
    const input = fileInput(container);
    const file = new File([new Uint8Array([1])], 'c.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://blob.test/new.jpg'));
    expect(uploadCover).toHaveBeenCalledWith(file);
    expect(toastSuccess).toHaveBeenCalledWith('Cover uploaded');
  });

  it('toasts the validation message and does not call onChange when the upload is rejected', async () => {
    uploadCover.mockRejectedValue(
      new ApiRequestError(400, { code: 'validation', message: 'Upload a JPG, PNG or WEBP image' }),
    );
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<CoverUploader value="" onChange={onChange} />);
    const input = fileInput(container);
    // Matches the input's client-side `accept` filter (jpeg/png/webp) so user-event actually
    // sets it as a selected file; the rejection here models a server-side check (e.g. corrupt
    // or mislabelled content) rather than the browser's own file picker filter.
    const file = new File([new Uint8Array([1])], 'c.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Upload a JPG, PNG or WEBP image'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
