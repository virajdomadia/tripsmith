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
    assert [b["value"] for b in badges] == [
        "filling-fast",
        "sold-out",
        "likely-to-sell-out",
        "guaranteed",
    ]
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
    assert set(res.json()) == {"themes", "badges", "enquiryTypes", "limits", "rules", "retention"}


async def test_meta_serves_the_rules_the_api_enforces(client: AsyncClient) -> None:
    # Q-5: the web reads these instead of copying them; pinned here so a change is deliberate.
    body = (await client.get("/meta")).json()
    rules = body["rules"]
    assert {k: v for k, v in rules.items() if k not in {"cancellationTiers", "ages"}} == {
        "depositPercent": 25,
        "balanceDays": 30,
        "graceDays": 2,
        "minPartPaise": 1_000_00,
        "reminderDays": [7, 3, 0],
        "holdMinutes": 10,
        "leadDays": 2,
        "freeChangeDays": 30,
        "changeHoldMinutes": 10,
        "onlineChangeDays": 15,
        "changeFeePaise": 1_000_00,
        "gstPercent": 5,
    }
    assert [(t["fromDays"], t["keptPercent"]) for t in rules["cancellationTiers"]] == [
        (30, 0),
        (15, 50),
        (0, 100),
    ]
    assert rules["cancellationTiers"][2]["refund"] == "no refund"
    assert rules["ages"] == {"childMin": 5, "childMax": 11, "adultMin": 12}
    assert body["retention"] == {"enquiryDays": 365, "detailsDays": 30, "sessionDays": 30}


def test_the_suggested_refund_follows_each_tier() -> None:
    # Q-5: derived from CANCELLATION_TIERS, so a tier's numbers change in one place.
    from app.business import CANCELLATION_TIERS, suggested_refund_paise

    total = 20_000_00
    for tier in CANCELLATION_TIERS:
        kept = total * tier.kept_percent // 100
        got = suggested_refund_paise(tier.from_days, paid_paise=total, total_paise=total)
        assert got == total - kept
