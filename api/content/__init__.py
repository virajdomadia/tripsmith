"""Seed content package. `load_content()` imports every module under destinations/ and
packages/ and returns the validated models (a bad module raises at import)."""

import importlib
import pkgutil
from dataclasses import dataclass, field
from pathlib import Path

from content._schema import (
    DestinationContent,
    LeaderContent,
    PackageContent,
    TestimonialContent,
)


@dataclass
class Content:
    destinations: list[DestinationContent] = field(default_factory=list)
    packages: list[PackageContent] = field(default_factory=list)
    testimonials: list[TestimonialContent] = field(default_factory=list)
    leaders: list[LeaderContent] = field(default_factory=list)  # P3: optional `leaders` module


def _modules(root: Path, sub: str) -> list[str]:
    return sorted(m.name for m in pkgutil.iter_modules([str(root / sub)]) if not m.ispkg)


def load_content(package: str = "content") -> Content:
    """`package` is the dotted name of a tree with this layout. Tests pass their frozen copy
    (`tests.fixture_content`) so their assertions do not move when the real catalog grows."""
    root = Path(next(iter(importlib.import_module(package).__path__)))
    content = Content()
    for name in _modules(root, "destinations"):
        content.destinations.append(
            importlib.import_module(f"{package}.destinations.{name}").DESTINATION
        )
    for name in _modules(root, "packages"):
        content.packages.append(importlib.import_module(f"{package}.packages.{name}").PACKAGE)
    content.testimonials = list(importlib.import_module(f"{package}.testimonials").TESTIMONIALS)
    if (root / "leaders.py").is_file():
        content.leaders = list(importlib.import_module(f"{package}.leaders").LEADERS)

    slugs = {d.slug for d in content.destinations}
    for p in content.packages:
        if p.destination not in slugs:
            raise ValueError(f"{p.slug}: unknown destination {p.destination!r}")
    package_slugs = {p.slug for p in content.packages}
    if len(package_slugs) != len(content.packages):
        raise ValueError("duplicate package slugs")
    for t in content.testimonials:
        if t.package and t.package not in package_slugs:
            raise ValueError(f"testimonial by {t.name}: unknown package {t.package!r}")
    _check_leaders(content)
    return content


def _check_leaders(content: Content) -> None:
    dates = {p.slug: {d.date for d in p.departures} for p in content.packages}
    led: set[str] = set()
    for leader in content.leaders:
        for slug in leader.packages:
            if slug not in dates:
                raise ValueError(f"leader {leader.slug}: unknown package {slug!r}")
            if slug in led:
                raise ValueError(f"leader {leader.slug}: {slug} already has a default leader")
            led.add(slug)
        for o in leader.overrides:
            if o.date not in dates.get(o.package, set()):
                raise ValueError(f"leader {leader.slug}: no departure {o.package} on {o.date}")
    if len({leader.slug for leader in content.leaders}) != len(content.leaders):
        raise ValueError("duplicate leader slugs")
