"""Runs router - handles evaluation run endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..schemas.common import PaginatedResponse
from ..schemas.run import (
    RunCreate,
    RunCreateResponse,
    RunDetailResponse,
    RunResultResponse,
    RunSummary,
)
from ..services.auth_service import AuthContext, get_api_key_auth, verify_project_access
from ..services.run_service import RunService

router = APIRouter(prefix="/runs", tags=["runs"])
settings = get_settings()


@router.post("", response_model=RunCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_run(
    data: RunCreate,
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload run results from CLI.

    This is the primary endpoint for the CLI to submit evaluation results.
    Requires API key authentication via X-API-Key header.

    The request body should match the CLI's RunResult structure.
    """
    # Verify project access
    project = await verify_project_access(data.project_id, auth, db)

    # Create the run
    service = RunService(db)
    run = await service.create_run(data, project)

    # Build dashboard URL
    dashboard_url = f"{settings.dashboard_url}/projects/{project.slug}/runs/{run.id}"

    return RunCreateResponse(
        id=run.id,
        status=run.status,
        pass_rate=run.pass_rate or 0,
        summary={
            "total": run.total_cases,
            "passed": run.passed_cases,
            "failed": run.failed_cases,
        },
        dashboard_url=dashboard_url,
    )


@router.get("", response_model=PaginatedResponse[RunSummary])
async def list_runs(
    project_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(
        None, pattern=r"^(pending|running|passed|failed|error)$"
    ),
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    List runs for a project.

    Returns paginated list of runs sorted by creation date (newest first).
    Requires API key authentication.
    """
    # Verify project access
    await verify_project_access(project_id, auth, db)

    service = RunService(db)
    runs, total = await service.list_runs(
        project_id=project_id,
        org_id=auth.org_id,
        page=page,
        page_size=page_size,
        status=status,
    )

    return PaginatedResponse.create(
        items=[RunSummary.model_validate(r) for r in runs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{run_id}", response_model=RunDetailResponse)
async def get_run(
    run_id: str,
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed run information including all test results.

    Requires API key authentication.
    """
    service = RunService(db)
    run = await service.get_run(run_id, auth.org_id)

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found",
        )

    # Convert results to response schema
    results = [RunResultResponse.model_validate(r) for r in run.results]

    return RunDetailResponse(
        id=run.id,
        project_id=run.project_id,
        git_sha=run.git_sha,
        git_ref=run.git_ref,
        git_message=run.git_message,
        pr_number=run.pr_number,
        status=run.status,
        total_cases=run.total_cases,
        passed_cases=run.passed_cases,
        failed_cases=run.failed_cases,
        pass_rate=run.pass_rate,
        config_hash=run.config_hash,
        metrics=run.metrics,
        thresholds_met=run.thresholds_met,
        threshold_violations=run.threshold_violations,
        started_at=run.started_at,
        finished_at=run.finished_at,
        duration_ms=run.duration_ms,
        created_at=run.created_at,
        results=results,
    )
