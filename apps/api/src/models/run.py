"""Run and RunResult models."""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base
from . import UUIDMixin

if TYPE_CHECKING:
    from .project import Project
    from .suite import Suite
    from .user import User
    from .evidence_pack import EvidencePack


class Run(Base, UUIDMixin):
    """Evaluation run model."""

    __tablename__ = "runs"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    suite_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("suites.id", ondelete="SET NULL"),
        nullable=True,
    )
    triggered_by: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Git context
    git_sha: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    git_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    git_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pr_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Run metadata
    status: Mapped[str] = mapped_column(
        String(50), default="pending", index=True
    )  # pending, running, passed, failed, error
    trigger: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # ci, manual, scheduled

    # Config snapshot
    config_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    config_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Results summary
    total_cases: Mapped[int] = mapped_column(Integer, default=0)
    passed_cases: Mapped[int] = mapped_column(Integer, default=0)
    failed_cases: Mapped[int] = mapped_column(Integer, default=0)
    pass_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Detailed metrics
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)

    # Threshold results
    thresholds_met: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    threshold_violations: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)

    # Timing
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="runs")
    suite: Mapped[Optional["Suite"]] = relationship("Suite")
    triggered_by_user: Mapped[Optional["User"]] = relationship("User")
    results: Mapped[List["RunResult"]] = relationship(
        "RunResult", back_populates="run", cascade="all, delete-orphan"
    )
    evidence_packs: Mapped[List["EvidencePack"]] = relationship(
        "EvidencePack", back_populates="run"
    )

    def __repr__(self) -> str:
        return f"<Run {self.id[:8]}... ({self.status})>"


class RunResult(Base, UUIDMixin):
    """Individual test case result within a run."""

    __tablename__ = "run_results"

    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    test_case_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("test_cases.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Test identification
    suite_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    case_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    case_input: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Execution results
    actual_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Evaluator output
    evaluator: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    evaluator_result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Performance
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Error handling
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    run: Mapped["Run"] = relationship("Run", back_populates="results")

    def __repr__(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        return f"<RunResult {self.case_name} ({status})>"
