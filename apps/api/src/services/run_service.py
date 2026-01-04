"""Run service for creating and retrieving runs."""

from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import Project, Run, RunResult
from ..schemas.run import RunCreate, SuiteResultCreate


class RunService:
    """Service for run operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_run(self, data: RunCreate, project: Project) -> Run:
        """
        Create a new run with all its results.

        Args:
            data: The run data from CLI
            project: The verified project

        Returns:
            The created Run object
        """
        # Determine final status based on thresholds
        status = data.status
        if data.thresholds_met is False:
            status = "failed"

        # Create the run
        run = Run(
            project_id=project.id,
            git_sha=data.git.sha if data.git else "unknown",
            git_ref=data.git.ref if data.git else None,
            git_message=data.git.message if data.git else None,
            pr_number=data.git.pr_number if data.git else None,
            status=status,
            trigger="ci",  # Default for CLI uploads
            config_hash=data.config_hash,
            total_cases=data.total,
            passed_cases=data.passed,
            failed_cases=data.failed,
            pass_rate=data.pass_rate * 100,  # Store as percentage
            metrics={
                "pii_detected": data.metrics.pii_detected,
                "prompt_injection_attempts": data.metrics.prompt_injection_attempts,
                "avg_latency_ms": data.metrics.avg_latency_ms,
                "total_tokens": data.metrics.total_tokens,
                "total_cost_usd": data.metrics.total_cost_usd,
            },
            thresholds_met=data.thresholds_met,
            threshold_violations=data.threshold_violations,
            started_at=data.started_at,
            finished_at=data.finished_at,
            duration_ms=data.duration_ms,
        )

        self.db.add(run)
        await self.db.flush()  # Get the run ID

        # Create run results from suite results
        for suite in data.suites:
            await self._create_suite_results(run.id, suite)

        return run

    async def _create_suite_results(
        self,
        run_id: str,
        suite: SuiteResultCreate,
    ) -> None:
        """Create RunResult records for each test case in a suite."""
        for case in suite.cases:
            result = RunResult(
                run_id=run_id,
                suite_name=suite.name,
                case_name=case.name,
                case_input=case.input,
                actual_output=case.output,
                passed=case.passed,
                score=case.score,
                evaluator=case.evaluator,
                evaluator_result={
                    "passed": case.evaluator_result.passed,
                    "score": case.evaluator_result.score,
                    "reason": case.evaluator_result.reason,
                    "details": case.evaluator_result.details,
                },
                latency_ms=case.latency_ms,
                tokens_used=case.tokens_used,
                cost_usd=case.cost_usd,
                error=case.error,
            )
            self.db.add(result)

    async def get_run(self, run_id: str, org_id: str) -> Optional[Run]:
        """
        Get a run by ID, verifying org access.

        Args:
            run_id: The run ID
            org_id: The organization ID for access control

        Returns:
            The Run object if found and accessible, None otherwise
        """
        stmt = (
            select(Run)
            .join(Project)
            .options(selectinload(Run.results))
            .where(Run.id == run_id, Project.org_id == org_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_runs(
        self,
        project_id: str,
        org_id: str,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
    ) -> Tuple[List[Run], int]:
        """
        List runs for a project with pagination.

        Args:
            project_id: The project ID
            org_id: The organization ID for access control
            page: Page number (1-indexed)
            page_size: Number of items per page
            status: Optional status filter

        Returns:
            Tuple of (runs list, total count)
        """
        # Base query
        base_query = (
            select(Run)
            .join(Project)
            .where(Run.project_id == project_id, Project.org_id == org_id)
        )

        if status:
            base_query = base_query.where(Run.status == status)

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        # Get paginated results
        stmt = (
            base_query.order_by(Run.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(stmt)
        runs = list(result.scalars().all())

        return runs, total
