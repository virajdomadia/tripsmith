"""Download one Wikimedia Commons photo into api/content/photos/ with its licence checked and its
credit appended to CREDITS.md (F4). Commons requires a descriptive User-Agent.

    uv run python scripts/fetch_photo.py "File:Solang 5.jpg" himachal/solang-valley.jpg

Refuses anything that is not CC BY / CC BY-SA / CC0 / public domain, or narrower than 1600 px.
Saves the 1400 px rendition Commons serves (the site never needs more), re-encoded by Pillow.
"""

import argparse
import html
import io
import re
import sys
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

PHOTOS_DIR = Path(__file__).resolve().parents[1] / "content" / "photos"
CREDITS = PHOTOS_DIR / "CREDITS.md"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "tripsmith-seed/1.0 (portfolio project; virajdomadia32@gmail.com)"
ALLOWED = re.compile(r"^(cc-by(-sa)?-\d\.\d|cc0|pd)", re.I)
MIN_WIDTH = 1600
RENDITION = 1400
_TAGS = re.compile(r"<[^>]+>")


def lookup(title: str) -> dict[str, Any]:
    res = httpx.get(
        API,
        params={
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size",
            "iiurlwidth": str(RENDITION),
            "format": "json",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=30,
        follow_redirects=True,
    )
    res.raise_for_status()
    page = next(iter(res.json()["query"]["pages"].values()))
    info = (page.get("imageinfo") or [None])[0]
    if info is None:
        raise SystemExit(f"not found on Commons: {title}")
    return info


def check(info: dict[str, Any], title: str) -> tuple[str, str]:
    """Returns (licence short name, artist) or exits — the licence gate is the point here."""
    meta = info["extmetadata"]
    licence_id = meta.get("License", {}).get("value", "")
    licence = meta.get("LicenseShortName", {}).get("value", licence_id)
    if not ALLOWED.match(licence_id):
        raise SystemExit(f"licence not allowed for {title}: {licence} ({licence_id!r})")
    if info["width"] < MIN_WIDTH:
        raise SystemExit(f"too small: {title} is {info['width']} px wide (need >= {MIN_WIDTH})")
    artist = html.unescape(_TAGS.sub("", meta.get("Artist", {}).get("value", ""))).strip()
    return licence, artist or "see source"


def save(info: dict[str, Any], dest: Path) -> None:
    data = httpx.get(
        info["thumburl"], headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True
    ).content
    with Image.open(io.BytesIO(data)) as im:
        rgb = im.convert("RGB")
        rgb.thumbnail((RENDITION, RENDITION * 2))
        dest.parent.mkdir(parents=True, exist_ok=True)
        rgb.save(dest, "JPEG", quality=82, optimize=True, progressive=True)


def credit(dest_rel: str, title: str, licence: str, artist: str, source: str) -> None:
    row = (
        f"| `{dest_rel}` | {title.removeprefix('File:')} | {licence} | {artist} "
        f"| [source]({source}) |\n"
    )
    with CREDITS.open("a", encoding="utf-8") as f:
        f.write(row)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("title", help='Commons title, e.g. "File:Solang 5.jpg"')
    parser.add_argument("dest", help="path under content/photos, e.g. himachal/solang-valley.jpg")
    args = parser.parse_args(argv)
    title = args.title if args.title.startswith("File:") else f"File:{args.title}"
    dest = PHOTOS_DIR / args.dest
    if dest.exists():
        raise SystemExit(f"{args.dest} already exists — pick another name or delete it first")
    info = lookup(title)
    licence, artist = check(info, title)
    save(info, dest)
    credit(args.dest, title, licence, artist, info["descriptionurl"])
    print(f"{args.dest}  {licence}  by {artist}  ({info['width']}x{info['height']} -> {RENDITION})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
