"""A frozen copy of the catalog as it was at 2f52be9 (1 destination, 2 packages, 3 testimonials).

Every db test seeds from here through `tests.settings.fixture_content()`, so the assertions in
test_catalog*, test_search and test_seed do not move when the real catalog under api/content/
grows (F4: 6 packages, F7: 12). Photos resolve to content/photos/ like the real files. Do not
edit these to match the live content — edit them only when a test needs different data.
"""
