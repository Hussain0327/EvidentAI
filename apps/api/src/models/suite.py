"""Suite and TestCase models."""

from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from . import UUIDMixin, TimestampMixin

if TYPE_CHECKING:
    from .project import Project


class Suite(Base, UUIDMixin, TimestampMixin):
    """Test suite model."""

    __tablename__ = "suites"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_yaml: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="suites")
    test_cases: Mapped[List["TestCase"]] = relationship(
        "TestCase", back_populates="suite", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Suite {self.name}>"


class TestCase(Base, UUIDMixin, TimestampMixin):
    """Test case within a suite."""

    __tablename__ = "test_cases"

    suite_id: Mapped[str] = mapped_column(
        ForeignKey("suites.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    input: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evaluator: Mapped[str] = mapped_column(String(50), nullable=False)
    evaluator_config: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)

    # Relationships
    suite: Mapped["Suite"] = relationship("Suite", back_populates="test_cases")

    def __repr__(self) -> str:
        return f"<TestCase {self.name}>"
