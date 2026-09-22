"""services/images: validate + resize an upload before it goes to Blob (06 C3)."""

import io

import pytest
from PIL import Image

from app.services.images import MAX_BYTES, MAX_PIXELS, MAX_SIDE, ImageError, prepare_image


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


def test_a_declared_image_over_max_pixels_is_rejected_before_decoding() -> None:
    # 1-bit mode keeps the file tiny on disk even at 7000x7000 (49 MP > the 40 MP cap).
    buf = io.BytesIO()
    Image.new("1", (7000, 7000)).save(buf, format="PNG")
    assert 7000 * 7000 > MAX_PIXELS
    with pytest.raises(ImageError, match="megapixels"):
        prepare_image(buf.getvalue(), "image/png")


def test_pillows_decompression_bomb_error_is_mapped_to_the_megapixels_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # `DecompressionBombError` subclasses `Exception`, not `OSError` — a naive except tuple
    # would let it escape as a 500. Pillow only *raises* above 2x `MAX_IMAGE_PIXELS` (it only
    # warns between 1x and 2x), so 100x100 (10_000 px) against a cap of 1000 clears that bar
    # without ever emitting a `DecompressionBombWarning`.
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)
    with pytest.raises(ImageError, match="megapixels"):
        prepare_image(png(100, 100), "image/png")


def test_mpo_jpegs_from_a_phone_are_accepted_as_plain_jpegs() -> None:
    # A phone's depth-map/3D JPEG: Pillow decodes it as a multi-frame MPO container, but it's
    # a genuine `image/jpeg` upload — refusing it would reject real camera photos. Write a real
    # 2-frame MPO (Pillow >= 9.3) rather than faking `.format`, so this exercises the actual
    # decode path.
    buf = io.BytesIO()
    first = Image.new("RGB", (200, 100), (20, 80, 200))
    second = Image.new("RGB", (200, 100), (200, 80, 20))
    first.save(buf, format="MPO", save_all=True, append_images=[second])
    written = Image.open(io.BytesIO(buf.getvalue()))
    assert written.format == "MPO"  # confirms Pillow actually wrote MPO, not plain JPEG

    out = prepare_image(buf.getvalue(), "image/jpeg")
    assert (out.ext, out.content_type) == ("jpg", "image/jpeg")
    assert Image.open(io.BytesIO(out.data)).format == "JPEG"


def test_icc_profile_survives_the_reencode() -> None:
    # Any bytes work here — Pillow's JPEG writer doesn't validate the profile, it just embeds
    # whatever is passed as the `icc_profile` chunk.
    buf = io.BytesIO()
    im = Image.new("RGB", (300, 200), (20, 80, 200))
    im.save(buf, format="JPEG", icc_profile=b"fakeprofile-bytes")
    out = prepare_image(buf.getvalue(), "image/jpeg")
    assert Image.open(io.BytesIO(out.data)).info.get("icc_profile") == b"fakeprofile-bytes"


def test_icc_profile_survives_exif_transpose_and_reencode() -> None:
    # The rotate path replaces `im` with a new Image from `exif_transpose`; make sure the ICC
    # profile captured before that swap still makes it into the final save.
    buf = io.BytesIO()
    im = Image.new("RGB", (200, 100), (20, 80, 200))
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: rotate 90 CW to display upright
    im.save(buf, format="JPEG", exif=exif.tobytes(), icc_profile=b"fakeprofile-bytes")
    out = prepare_image(buf.getvalue(), "image/jpeg")
    assert (out.width, out.height) == (100, 200)
    assert Image.open(io.BytesIO(out.data)).info.get("icc_profile") == b"fakeprofile-bytes"
