"""F4 content rules: the real catalog under api/content/ is live-eligible, covers every theme,
dates ahead of the content floor, and every photo is credited. Counts are not asserted — the
catalog grows in F7; the rules do not."""

import datetime as dt
import re

from app.models.enums import PackageStatus, Theme
from content import load_content
from content._schema import PHOTOS_DIR

# Departures before this never reach production: raise it when the content moves forward (F7).
CONTENT_FLOOR = dt.date(2026, 11, 1)
CREDITS = PHOTOS_DIR / "CREDITS.md"


def _on_disk() -> set[str]:
    return {p.relative_to(PHOTOS_DIR).as_posix() for p in PHOTOS_DIR.glob("*/*.jpg")}


def _credited() -> set[str]:
    return set(re.findall(r"^\| `([^`]+)` \|", CREDITS.read_text(encoding="utf-8"), re.M))


def test_every_destination_has_a_live_package_and_every_theme_is_covered() -> None:
    content = load_content()
    live = [p for p in content.packages if p.status == PackageStatus.LIVE]
    assert {p.destination for p in live} == {d.slug for d in content.destinations}
    assert {t for p in live for t in p.themes} == set(Theme)
    # F7's floor (07-plan: 6 destinations, 12 packages, 6 testimonials), not a ceiling.
    assert len(live) >= 12 and len(content.destinations) >= 6
    assert len(content.testimonials) >= 6


def test_every_package_has_three_or_four_future_departures() -> None:
    for p in load_content().packages:
        assert 3 <= len(p.departures) <= 4, p.slug
        assert min(d.date for d in p.departures) >= CONTENT_FLOOR, p.slug
        dates = [d.date for d in p.departures]
        assert dates == sorted(dates), f"{p.slug}: list departures in date order"


def test_from_prices_match_the_locked_list() -> None:
    """The mockup's from-prices are what home and listing were designed around (07-plan F4, F7)."""
    cheapest = {
        p.slug: min(d.price_double_inr for d in p.departures) for p in load_content().packages
    }
    assert cheapest["munnar-alleppey-houseboat"] == 21_999
    assert cheapest["kochi-thekkady-kovalam"] == 27_999
    assert cheapest["shimla-manali-classic"] == 18_499
    assert cheapest["manali-kasol-tosh"] == 19_999
    assert cheapest["jaipur-jodhpur-udaipur"] == 26_499
    assert cheapest["jaisalmer-desert-nights"] == 19_499
    assert cheapest["port-blair-havelock-neil"] == 32_999
    assert cheapest["havelock-honeymoon"] == 34_999
    assert cheapest["leh-nubra-pangong"] == 29_999
    assert cheapest["leh-turtuk"] == 27_499


def test_destination_positions_are_unique_and_ordered() -> None:
    positions = [d.position for d in sorted(load_content().destinations, key=lambda d: d.position)]
    assert positions == sorted(set(positions)), "every destination needs its own position"


def test_every_testimonial_names_a_different_trip() -> None:
    linked = [t.package for t in load_content().testimonials if t.package]
    assert len(linked) == len(set(linked)), "spread testimonials across trips"


def test_every_photo_is_credited_and_every_credit_exists() -> None:
    on_disk, credited = _on_disk(), _credited()
    assert on_disk - credited == set(), "photos without a CREDITS.md row"
    assert credited - on_disk == set(), "CREDITS.md rows without a file"


def test_no_photo_is_unused() -> None:
    content = load_content()
    used = {ph.file for p in content.packages for ph in p.photos}
    used |= {d.cover.file for d in content.destinations}
    assert _on_disk() - used == set(), "delete these photos and their credit rows"


def test_photo_dirs_are_destination_slugs() -> None:
    slugs = {d.slug for d in load_content().destinations}
    assert {p.name for p in PHOTOS_DIR.iterdir() if p.is_dir()} <= slugs


def test_load_content_takes_a_package_name() -> None:
    """The frozen copy the db tests seed (tests/fixture_content/) is the 2f52be9 catalog."""
    frozen = load_content("tests.fixture_content")
    assert [d.slug for d in frozen.destinations] == ["goa"]
    assert sorted(p.slug for p in frozen.packages) == ["goa-quiet-escape", "north-goa-beaches"]
    assert len(frozen.testimonials) == 3
