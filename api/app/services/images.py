"""Validate and normalise an image upload before it reaches Blob (06 C3; F17 covers, F20 galleries).

Pure and synchronous — call it via `asyncio.to_thread` from a request.
"""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 4 * 1024 * 1024  # Vercel's function body cap is 4.5 MB
MAX_SIDE = 2000
MAX_PIXELS = 40_000_000
MEGAPIXELS_MSG = "Images must be under 40 megapixels"
ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_FORMAT_TO_TYPE = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
_SAVE_KWARGS = {"JPEG": {"quality": 85, "optimize": True}, "WEBP": {"quality": 85}, "PNG": {}}


class ImageError(ValueError):
    """A user-facing reason the upload was refused."""


@dataclass(frozen=True)
class PreparedImage:
    data: bytes
    content_type: str
    ext: str
    width: int
    height: int


def prepare_image(data: bytes, content_type: str) -> PreparedImage:
    if content_type not in ALLOWED:
        raise ImageError("Upload a JPG, PNG or WEBP image")
    if len(data) > MAX_BYTES:
        raise ImageError("Images must be 4 MB or smaller")
    try:
        im = Image.open(io.BytesIO(data))
        if im.width * im.height > MAX_PIXELS:
            raise ImageError(MEGAPIXELS_MSG)
        im.load()
    except Image.DecompressionBombError as exc:
        # Pillow's own guard against a small file that decodes to a huge bitmap; it subclasses
        # `Exception`, not `OSError`, and fires inside `Image.open()` from the header-declared size
        # once that is more than 2x `Image.MAX_IMAGE_PIXELS` — so it wraps the open call too.
        raise ImageError(MEGAPIXELS_MSG) from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageError("That file is not an image") from exc
    fmt = im.format or ""
    if fmt == "MPO":
        # A phone depth-map/3D JPEG: Pillow reports the container format as MPO, but it's a
        # genuine `image/jpeg` upload. Pillow only ever decodes/re-saves the first frame here
        # (no `im.seek(1)`), so treating it as JPEG is exactly what a plain JPEG upload gets.
        fmt = "JPEG"
    if fmt not in _FORMAT_TO_TYPE:
        raise ImageError("Upload a JPG, PNG or WEBP image")
    icc_profile = im.info.get("icc_profile")
    # `exif_transpose` bakes the EXIF `Orientation` tag into the pixels and strips it, so a
    # phone-shot portrait photo (landscape buffer + Orientation) isn't served sideways. It
    # returns a new Image (format reset to None — already captured as `fmt` above), or the
    # original unchanged when there is nothing to rotate; falls back to `im` if a very old
    # Pillow ever returns None (Pillow >= 9.1 always returns an image).
    im = ImageOps.exif_transpose(im) or im
    if fmt == "JPEG" and im.mode != "RGB":
        im = im.convert("RGB")
    if max(im.size) > MAX_SIDE:
        width, height = im.size
        if width >= height:
            im = im.resize((MAX_SIDE, round(height * MAX_SIDE / width)), Image.Resampling.LANCZOS)
        else:
            im = im.resize((round(width * MAX_SIDE / height), MAX_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    save_kwargs = dict(_SAVE_KWARGS[fmt])
    if icc_profile is not None:
        # Keep a Display P3 (or other embedded) profile through the re-encode; Pillow's
        # JPEG/PNG/WEBP writers only look at this kwarg when it's actually present.
        save_kwargs["icc_profile"] = icc_profile
    im.save(buf, format=fmt, **save_kwargs)
    real_type = _FORMAT_TO_TYPE[fmt]
    return PreparedImage(
        data=buf.getvalue(),
        content_type=real_type,
        ext=ALLOWED[real_type],
        width=im.width,
        height=im.height,
    )
