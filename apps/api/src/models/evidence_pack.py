"""Evidence pack and approval models."""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from . import UUIDMixin

if TYPE_CHECKING:
    from .project import Project
    from .run import Run
    from .user import User


class EvidencePack(Base, UUIDMixin):
    """Evidence pack model for compliance documentation."""

    __tablename__ = "evidence_packs"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Pack metadata
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    template_version: Mapped[str] = mapped_column(String(50), default="v1")

    # Content
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Generated artifacts
    pdf_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    json_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Sharing
    share_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="evidence_packs")
    run: Mapped[Optional["Run"]] = relationship("Run", back_populates="evidence_packs")
    creator: Mapped[Optional["User"]] = relationship("User")
    approvals: Mapped[List["Approval"]] = relationship(
        "Approval", back_populates="evidence_pack", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<EvidencePack {self.id[:8]}...>"


class Approval(Base, UUIDMixin):
    """Approval model for change control."""

    __tablename__ = "approvals"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    evidence_pack_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("evidence_packs.id", ondelete="CASCADE"),
        nullable=True,
    )
    approver_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    approver_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="pending"
    )  # pending, approved, rejected
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    evidence_pack: Mapped[Optional["EvidencePack"]] = relationship(
        "EvidencePack", back_populates="approvals"
    )
    approver: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<Approval {self.status}>"
