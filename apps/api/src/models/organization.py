"""Organization model - multi-tenant root entity."""

from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from . import UUIDMixin, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .project import Project
    from .api_key import ApiKey


class Organization(Base, UUIDMixin, TimestampMixin):
    """Organization model - the root of multi-tenancy."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(50), default="free")  # free, pro, enterprise
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationships
    users: Mapped[List["User"]] = relationship(
        "User", back_populates="organization", cascade="all, delete-orphan"
    )
    projects: Mapped[List["Project"]] = relationship(
        "Project", back_populates="organization", cascade="all, delete-orphan"
    )
    api_keys: Mapped[List["ApiKey"]] = relationship(
        "ApiKey", back_populates="organization", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Organization {self.slug}>"
