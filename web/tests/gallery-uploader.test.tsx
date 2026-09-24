// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../src/lib/api-errors';
import type { components } from '../src/lib/api-types';

type AdminImage = components['schemas']['AdminImage'];

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/packages/p1',
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

vi.mock('next/image', () => ({
  default: ({ fill, sizes, priority, alt, ...rest }: Record<string, unknown>) => {
    void fill;
    void sizes;
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt as string} {...rest} />;
  },
}));

const adminRequest = vi.fn();
const uploadPackageImage = vi.fn();
vi.mock('@/lib/admin/client', () => ({ adminRequest, uploadPackageImage }));

const { GalleryUploader } = await import('../src/components/admin/packages/GalleryUploader');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const image = (id: string, position: number): AdminImage => ({
  id,
  url: `https://blob.test/${id}.jpg`,
  alt: `Photo ${id}`,
  width: 1600,
  height: 1000,
  position,
});

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

describe('GalleryUploader', () => {
  it('keeps uploading past a bad file, names it, and still refreshes', async () => {
    uploadPackageImage
      .mockResolvedValueOnce(image('a', 0))
      .mockRejectedValueOnce(
        new ApiRequestError(400, {
          code: 'validation',
          message: 'Images must be 4 MB or smaller',
          fieldErrors: { file: 'Images must be 4 MB or smaller' },
        }),
      )
      .mockResolvedValueOnce(image('c', 1));
    const { container } = render(
      <GalleryUploader packageId="p1" images={[]} coverImageId={null} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [file('a.jpg'), file('huge.jpg'), file('c.jpg')] },
    });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(uploadPackageImage).toHaveBeenCalledTimes(3);
    expect(toastSuccess).toHaveBeenCalledWith('2 photos uploaded');
    expect(toastError).toHaveBeenCalledWith(
      'This photo was not uploaded: huge.jpg (Images must be 4 MB or smaller)',
    );
  });

  it('on an expired session says what was saved and leaves the refresh to the login', async () => {
    uploadPackageImage
      .mockResolvedValueOnce(image('a', 0))
      .mockResolvedValueOnce(image('b', 1))
      .mockRejectedValueOnce(
        new ApiRequestError(401, { code: 'unauthorized', message: 'Sign in to continue' }),
      );
    const { container } = render(
      <GalleryUploader packageId="p1" images={[]} coverImageId={null} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [file('a.jpg'), file('b.jpg'), file('c.jpg'), file('d.jpg')] },
    });

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith('2 photos saved before your session expired');
    expect(uploadPackageImage).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('asks before deleting a photo', async () => {
    const user = userEvent.setup();
    adminRequest.mockResolvedValue(undefined);
    render(
      <GalleryUploader packageId="p1" images={[image('a', 0), image('b', 1)]} coverImageId="a" />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete photo 2' }));
    expect(adminRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Delete photo 2?' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/packages/p1/images/b', {
        method: 'DELETE',
      }),
    );
  });

  it('keeps the photo when the owner backs out', async () => {
    const user = userEvent.setup();
    render(<GalleryUploader packageId="p1" images={[image('a', 0)]} coverImageId="a" />);
    await user.click(screen.getByRole('button', { name: 'Delete photo 1' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(adminRequest).not.toHaveBeenCalled();
  });
});
