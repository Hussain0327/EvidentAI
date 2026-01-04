"""Authentication service for API key validation."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import ApiKey, Organization, Project
from ..utils.security import hash_api_key

# API key header extractor
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


class AuthContext:
    """
    Context object containing authenticated entity information.

    This is returned by the authentication dependency and provides
    access to the authenticated organization and optionally project.
    """

    def __init__(
        self,
        api_key: ApiKey,
        organization: Organization,
        project: Optional[Project] = None,
    ):
        self.api_key = api_key
        self.organization = organization
        self.project = project
        self.org_id = organization.id
        self.project_id = project.id if project else None

    def __repr__(self) -> str:
        return f"<AuthContext org={self.organization.slug}>"


async def get_api_key_auth(
    api_key: Optional[str] = Security(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    """
    Dependency for API key authentication.

    Validates the provided API key and returns an AuthContext
    with the associated organization and optional project.

    Usage:
        @router.post("/runs")
        async def create_run(auth: AuthContext = Depends(get_api_key_auth)):
            # auth.org_id is the authenticated organization
            pass

    Raises:
        HTTPException: If the API key is missing, invalid, or expired
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required. Provide X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Hash the provided key
    key_hash = hash_api_key(api_key)

    # Look up the key with relationships
    stmt = (
        select(ApiKey)
        .options(
            selectinload(ApiKey.organization),
            selectinload(ApiKey.project),
        )
        .where(ApiKey.key_hash == key_hash)
    )
    result = await db.execute(stmt)
    db_key = result.scalar_one_or_none()

    if not db_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    # Check expiration
    if db_key.expires_at and db_key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has expired",
        )

    # Update last used timestamp (fire and forget - don't block on this)
    db_key.last_used_at = datetime.now(timezone.utc)

    return AuthContext(
        api_key=db_key,
        organization=db_key.organization,
        project=db_key.project,
    )


async def verify_project_access(
    project_id: str,
    auth: AuthContext,
    db: AsyncSession,
) -> Project:
    """
    Verify that the authenticated context has access to the given project.

    Args:
        project_id: The project ID to verify access for
        auth: The authenticated context
        db: Database session

    Returns:
        The verified Project object

    Raises:
        HTTPException: If the project doesn't exist or access is denied
    """
    # If API key is scoped to a specific project, verify match
    if auth.project_id and auth.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not have access to this project",
        )

    # Verify project exists and belongs to the org
    stmt = select(Project).where(
        Project.id == project_id,
        Project.org_id == auth.org_id,
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied",
        )

    return project
