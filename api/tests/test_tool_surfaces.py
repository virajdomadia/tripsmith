"""The shared tool registry says which surfaces list each tool (chat = the website's Gemini loop,
mcp = the MCP server)."""

from app.services.ai.tools import TOOL_SPECS, TOOLS


def test_chat_lists_only_chat_tools() -> None:
    assert {s.name for s in TOOL_SPECS} == {
        "searchPackages",
        "checkAvailability",
        "startBooking",
        "createEnquiry",
    }


def test_create_enquiry_is_chat_only() -> None:
    # MCP's startEnquiry wraps it; the MCP listing does not expose it under its chat name.
    assert "mcp" not in TOOLS["createEnquiry"].surfaces
    assert "chat" in TOOLS["createEnquiry"].surfaces


def test_mcp_listing_follows_mcp_tool_names() -> None:
    from app.services.mcp.adapter import MCP_TOOL_NAMES, tool_list

    assert tuple(t.name for t in tool_list()) == MCP_TOOL_NAMES
