"""User model."""

from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from . import UUIDMixin, TimestampMixin

if TYPE_CHECKING:
    from .organization import Organization


class User(Base, UUIDMixin, TimestampMixin):
    """User model."""

    __tablename__ = "users"

    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    github_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    github_access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="member")  # owner, admin, member

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="users")

    def __repr__(self) -> str:
        return f"<User {self.email}>"
