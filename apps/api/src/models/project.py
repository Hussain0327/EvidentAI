"""Project model."""

from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from . import UUIDMixin, TimestampMixin

if TYPE_CHECKING:
    from .organization import Organization
    from .suite import Suite
    from .run import Run
    from .api_key import ApiKey
    from .evidence_pack import EvidencePack


class Project(Base, UUIDMixin, TimestampMixin):
    """Project model - represents a GenAI application being tested."""

    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_project_org_slug"),
    )

    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    github_repo_owner: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    github_repo_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    github_installation_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    default_branch: Mapped[str] = mapped_column(String(255), default="main")

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="projects")
    suites: Mapped[List["Suite"]] = relationship(
        "Suite", back_populates="project", cascade="all, delete-orphan"
    )
    runs: Mapped[List["Run"]] = relationship(
        "Run", back_populates="project", cascade="all, delete-orphan"
    )
    api_keys: Mapped[List["ApiKey"]] = relationship(
        "ApiKey", back_populates="project", cascade="all, delete-orphan"
    )
    evidence_packs: Mapped[List["EvidencePack"]] = relationship(
        "EvidencePack", back_populates="project", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Project {self.slug}>"
