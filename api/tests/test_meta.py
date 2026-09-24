"""GET /meta — runtime constants both sides need (06 C0, 04 §3)."""

from httpx import AsyncClient


async def test_meta_lists_themes_with_labels(client: AsyncClient) -> None:
    res = await client.get("/meta")
    assert res.status_code == 200
    themes = res.json()["themes"]
    assert [t["value"] for t in themes] == [
        "beach",
        "hills",
        "honeymoon",
        "family",
        "adventure",
        "heritage",
    ]
    assert all(t["label"] for t in themes)


async def test_meta_lists_badges_with_labels(client: AsyncClient) -> None:
    res = await client.get("/meta")
    badges = res.json()["badges"]
    assert [b["value"] for b in badges] == ["filling-fast", "sold-out", "guaranteed"]
    assert all(b["label"] for b in badges)


async def test_meta_lists_v1_enquiry_types(client: AsyncClient) -> None:
    # Only the types the v1 form can submit; callback/group/chat-handoff arrive with their features.
    res = await client.get("/meta")
    types = res.json()["enquiryTypes"]
    assert [t["value"] for t in types] == ["standard", "custom", "contact"]
    assert all(t["label"] for t in types)


async def test_meta_limits_match_the_validation_rules(client: AsyncClient) -> None:
    res = await client.get("/meta")
    assert res.json()["limits"] == {
        "maxTravellers": 12,
        "maxThemesPerPackage": 3,
        "enquiryMessageMax": 1000,
        "imageMaxBytes": 4 * 1024 * 1024,
    }


async def test_meta_is_publicly_cacheable(client: AsyncClient) -> None:
    res = await client.get("/meta")
    assert res.headers["cache-control"] == "public, s-maxage=60, stale-while-revalidate=300"


async def test_meta_has_no_extra_top_level_keys(client: AsyncClient) -> None:
    res = await client.get("/meta")
    assert set(res.json()) == {"themes", "badges", "enquiryTypes", "limits"}
