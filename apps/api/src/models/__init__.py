"""SQLAlchemy models for EvidentAI."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class UUIDMixin:
    """Mixin that adds a UUID primary key stored as string for SQLite compatibility."""

    id: Mapped[str] = mapped_column(
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )


class TimestampMixin:
    """Mixin that adds created_at and updated_at timestamps."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# Import all models to register them with SQLAlchemy
from .organization import Organization
from .user import User
from .project import Project
from .api_key import ApiKey
from .suite import Suite, TestCase
from .run import Run, RunResult
from .evidence_pack import EvidencePack, Approval

__all__ = [
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    "Organization",
    "User",
    "Project",
    "ApiKey",
    "Suite",
    "TestCase",
    "Run",
    "RunResult",
    "EvidencePack",
    "Approval",
]
