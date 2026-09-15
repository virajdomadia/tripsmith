"""Public, unauthenticated routes (06 C-REST).

Named `site` (mirrors web's `(site)` route group) rather than `public`: Vercel's Python builder
treats any directory called `public` as CDN static assets and leaves it out of the function
bundle — see tests/test_bundle_layout.py.
"""
