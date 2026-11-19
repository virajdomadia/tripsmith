"""v4: one row per MCP call served (06 `mcp_requests`; migration 0029).

Diagnostic only. `client_name`, `client_version` and `user_agent` are what the caller says it is,
never used for limits or trust; `args` has contact details redacted (`services/mcp/log.py`);
`ip_hash` is the keyed digest `services/enquiries.hash_ip` makes, never the address.
"""

from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedMixin, IdMixin


class McpRequest(IdMixin, CreatedMixin, Base):
    __tablename__ = "mcp_requests"
    __table_args__ = (
        CheckConstraint("method IN ('tools/call', 'resources/read', 'prompts/get')", name="method"),
        Index("ix_mcp_requests_created_at", text("created_at DESC")),
        Index("ix_mcp_requests_name_created_at", "name", "created_at"),
    )

    client_name: Mapped[str | None] = mapped_column(Text)
    client_version: Mapped[str | None] = mapped_column(Text)
    user_agent: Mapped[str | None] = mapped_column(Text)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    args: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    ip_hash: Mapped[str] = mapped_column(Text, nullable=False)
