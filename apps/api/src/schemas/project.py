"""Project schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .common import BaseSchema


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")
    description: Optional[str] = None
    github_repo_owner: Optional[str] = None
    github_repo_name: Optional[str] = None
    default_branch: str = "main"


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    github_repo_owner: Optional[str] = None
    github_repo_name: Optional[str] = None
    default_branch: Optional[str] = None


class ProjectSummary(BaseSchema):
    """Summary schema for project list views."""

    id: str
    name: str
    slug: str
    description: Optional[str]
    created_at: datetime


class ProjectResponse(BaseSchema):
    """Full project response schema."""

    id: str
    org_id: str
    name: str
    slug: str
    description: Optional[str]
    github_repo_owner: Optional[str]
    github_repo_name: Optional[str]
    github_installation_id: Optional[str]
    default_branch: str
    created_at: datetime
    updated_at: datetime
