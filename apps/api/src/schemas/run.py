"""Run schemas - matches CLI RunResult structure."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .common import BaseSchema


# ============================================================================
# Request Schemas (matching CLI RunResult structure)
# ============================================================================


class GitInfoCreate(BaseModel):
    """Git context for a run."""

    sha: str = Field(..., min_length=1, max_length=40)
    ref: Optional[str] = None
    message: Optional[str] = None
    pr_number: Optional[int] = None


class EvaluatorResultCreate(BaseModel):
    """Evaluator result from CLI."""

    passed: bool
    score: float = Field(..., ge=0, le=1)
    reason: Optional[str] = None
    details: Optional[dict] = None


class TestCaseResultCreate(BaseModel):
    """Individual test case result from CLI."""

    name: str
    input: str
    output: str
    passed: bool
    score: float = Field(..., ge=0, le=1)
    evaluator: str
    evaluator_result: EvaluatorResultCreate
    latency_ms: int
    tokens_used: Optional[int] = None
    cost_usd: Optional[float] = None
    error: Optional[str] = None


class SuiteResultCreate(BaseModel):
    """Suite result containing test cases from CLI."""

    name: str
    total: int
    passed: int
    failed: int
    pass_rate: float = Field(..., ge=0, le=1)
    cases: List[TestCaseResultCreate]


class MetricsCreate(BaseModel):
    """Aggregated metrics from CLI run."""

    pii_detected: int = 0
    prompt_injection_attempts: int = 0
    avg_latency_ms: float = 0
    total_tokens: int = 0
    total_cost_usd: float = 0


class RunCreate(BaseModel):
    """
    Schema for CLI run upload.

    This matches the CLI's RunResult TypeScript interface.
    """

    project_id: str
    git: Optional[GitInfoCreate] = None
    config_hash: str
    started_at: datetime
    finished_at: datetime
    duration_ms: int
    status: str = Field(..., pattern=r"^(passed|failed|error)$")
    total: int
    passed: int
    failed: int
    pass_rate: float = Field(..., ge=0, le=1)
    suites: List[SuiteResultCreate]
    metrics: MetricsCreate
    thresholds_met: bool
    threshold_violations: Optional[List[str]] = None


# ============================================================================
# Response Schemas
# ============================================================================


class RunSummary(BaseSchema):
    """Summary schema for run list views."""

    id: str
    project_id: str
    git_sha: str
    git_ref: Optional[str]
    status: str
    total_cases: int
    passed_cases: int
    failed_cases: int
    pass_rate: Optional[float]
    duration_ms: Optional[int]
    created_at: datetime


class RunResponse(BaseSchema):
    """Full run response schema."""

    id: str
    project_id: str
    git_sha: str
    git_ref: Optional[str]
    git_message: Optional[str]
    pr_number: Optional[int]
    status: str
    total_cases: int
    passed_cases: int
    failed_cases: int
    pass_rate: Optional[float]
    config_hash: Optional[str]
    metrics: dict
    thresholds_met: Optional[bool]
    threshold_violations: Optional[List[str]]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    duration_ms: Optional[int]
    created_at: datetime


class RunResultResponse(BaseSchema):
    """Individual test result response."""

    id: str
    suite_name: Optional[str]
    case_name: Optional[str]
    case_input: Optional[str]
    actual_output: Optional[str]
    passed: bool
    score: Optional[float]
    evaluator: Optional[str]
    evaluator_result: Optional[dict]
    latency_ms: Optional[int]
    error: Optional[str]


class RunDetailResponse(RunResponse):
    """Run response with all test results included."""

    results: List[RunResultResponse]


class RunCreateResponse(BaseSchema):
    """Response returned after creating a run."""

    id: str
    status: str
    pass_rate: float
    summary: dict
    dashboard_url: str
