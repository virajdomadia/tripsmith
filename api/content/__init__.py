"""Seed content package. `load_content()` imports every module under destinations/ and
packages/ and returns the validated models (a bad module raises at import)."""

import importlib
import pkgutil
from dataclasses import dataclass, field
from pathlib import Path

from content._schema import DestinationContent, PackageContent, TestimonialContent

ROOT = Path(__file__).resolve().parent


@dataclass
class Content:
    destinations: list[DestinationContent] = field(default_factory=list)
    packages: list[PackageContent] = field(default_factory=list)
    testimonials: list[TestimonialContent] = field(default_factory=list)


def _modules(sub: str) -> list[str]:
    return sorted(m.name for m in pkgutil.iter_modules([str(ROOT / sub)]) if not m.ispkg)


def load_content() -> Content:
    content = Content()
    for name in _modules("destinations"):
        content.destinations.append(
            importlib.import_module(f"content.destinations.{name}").DESTINATION
        )
    for name in _modules("packages"):
        content.packages.append(importlib.import_module(f"content.packages.{name}").PACKAGE)
    content.testimonials = list(importlib.import_module("content.testimonials").TESTIMONIALS)

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
    return content
