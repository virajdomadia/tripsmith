"""services/images: validate + resize an upload before it goes to Blob (06 C3)."""

import io

import pytest
from PIL import Image

from app.services.images import MAX_BYTES, MAX_SIDE, ImageError, prepare_image


def png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (200, 120, 40)).save(buf, format="PNG")
    return buf.getvalue()


def jpeg(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (20, 80, 200)).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def test_small_images_pass_through_in_their_own_format() -> None:
    out = prepare_image(png(300, 200), "image/png")
    assert (out.width, out.height, out.ext, out.content_type) == (300, 200, "png", "image/png")
    assert Image.open(io.BytesIO(out.data)).format == "PNG"
    out = prepare_image(jpeg(300, 200), "image/jpeg")
    assert out.ext == "jpg" and Image.open(io.BytesIO(out.data)).format == "JPEG"


def test_large_images_are_resized_to_the_longest_side() -> None:
    out = prepare_image(jpeg(4000, 1000), "image/jpeg")
    assert (out.width, out.height) == (MAX_SIDE, 500)


def test_exif_orientation_is_applied_and_stripped() -> None:
    buf = io.BytesIO()
    im = Image.new("RGB", (200, 100), (20, 80, 200))
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: rotate 90 CW to display upright
    im.save(buf, format="JPEG", exif=exif.tobytes())
    out = prepare_image(buf.getvalue(), "image/jpeg")
    assert (out.width, out.height) == (100, 200)
    assert Image.open(io.BytesIO(out.data)).getexif().get(0x0112) in (None, 1)


def test_rejects_wrong_type_size_and_garbage() -> None:
    with pytest.raises(ImageError, match="JPG, PNG or WEBP"):
        prepare_image(png(10, 10), "image/gif")
    with pytest.raises(ImageError, match="4 MB"):
        prepare_image(b"x" * (MAX_BYTES + 1), "image/png")
    with pytest.raises(ImageError, match="not an image"):
        prepare_image(b"definitely not an image", "image/png")
    # Declared PNG, actually JPEG bytes: the sniffed format wins the extension.
    out = prepare_image(jpeg(20, 20), "image/png")
    assert out.ext == "jpg" and out.content_type == "image/jpeg"
