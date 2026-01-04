"""Projects router - handles project CRUD endpoints."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Project
from ..schemas.common import PaginatedResponse
from ..schemas.project import ProjectCreate, ProjectResponse, ProjectSummary, ProjectUpdate
from ..services.auth_service import AuthContext, get_api_key_auth

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=PaginatedResponse[ProjectSummary])
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    List all projects for the authenticated organization.

    Requires API key authentication.
    """
    # Count total
    count_stmt = select(func.count()).where(Project.org_id == auth.org_id)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Get paginated results
    stmt = (
        select(Project)
        .where(Project.org_id == auth.org_id)
        .order_by(Project.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    projects = list(result.scalars().all())

    return PaginatedResponse.create(
        items=[ProjectSummary.model_validate(p) for p in projects],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new project.

    Requires API key authentication.
    """
    # Check if slug already exists in this org
    existing = await db.execute(
        select(Project).where(
            Project.org_id == auth.org_id,
            Project.slug == data.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project with slug '{data.slug}' already exists",
        )

    project = Project(
        org_id=auth.org_id,
        name=data.name,
        slug=data.slug,
        description=data.description,
        github_repo_owner=data.github_repo_owner,
        github_repo_name=data.github_repo_name,
        default_branch=data.default_branch,
    )
    db.add(project)
    await db.flush()

    return ProjectResponse.model_validate(project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a project by ID.

    Requires API key authentication.
    """
    stmt = select(Project).where(
        Project.id == project_id,
        Project.org_id == auth.org_id,
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a project.

    Requires API key authentication.
    """
    stmt = select(Project).where(
        Project.id == project_id,
        Project.org_id == auth.org_id,
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Update fields that were provided
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.flush()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    auth: AuthContext = Depends(get_api_key_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a project.

    Requires API key authentication. This will cascade delete all associated
    runs, suites, and evidence packs.
    """
    stmt = select(Project).where(
        Project.id == project_id,
        Project.org_id == auth.org_id,
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    await db.delete(project)
