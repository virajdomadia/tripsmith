"""The shared tool registry says which surfaces list each tool (chat = the website's Gemini loop,
mcp = the MCP server)."""

from app.services.ai.tools import TOOL_SPECS, TOOLS
from app.services.mcp.adapter import MCP_TOOL_NAMES, tool_list


def test_chat_lists_seven_tools() -> None:
    assert {s.name for s in TOOL_SPECS} == {
        "searchPackages",
        "checkAvailability",
        "startBooking",
        "createEnquiry",
        "getPackageDetails",
        "quotePrice",
        "getReviews",
    }


def test_create_enquiry_is_chat_only() -> None:
    # MCP's startEnquiry wraps it; the MCP listing does not expose it under its chat name.
    assert "mcp" not in TOOLS["createEnquiry"].surfaces
    assert "chat" in TOOLS["createEnquiry"].surfaces


def test_mcp_listing_follows_mcp_tool_names() -> None:
    assert tuple(t.name for t in tool_list()) == MCP_TOOL_NAMES


def test_registry_backed_mcp_tools_carry_the_mcp_surface() -> None:
    for name in MCP_TOOL_NAMES:
        if name != "startEnquiry":  # wraps the chat-only createEnquiry
            assert "mcp" in TOOLS[name].surfaces, name
    assert "mcp" not in TOOLS["createEnquiry"].surfaces


def test_mcp_listing_is_driven_by_the_surface_flag(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import dataclasses

    chat_only = dataclasses.replace(TOOLS["checkAvailability"], surfaces=frozenset({"chat"}))
    monkeypatch.setitem(TOOLS, "checkAvailability", chat_only)
    assert "checkAvailability" not in [t.name for t in tool_list()]
