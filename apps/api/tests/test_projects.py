"""Tests for the projects router."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import ApiKey, Organization, Project


class TestListProjects:
    """Tests for GET /api/v1/projects endpoint."""

    @pytest.mark.asyncio
    async def test_list_projects_with_org_key(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test listing projects with org-level API key."""
        raw_key, _ = org_level_api_key

        response = await client.get(
            "/api/v1/projects",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert data["total"] >= 1
        # Find our test project
        project_ids = [p["id"] for p in data["items"]]
        assert test_project.id in project_ids

    @pytest.mark.asyncio
    async def test_list_projects_pagination(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_org: Organization,
        org_level_api_key: tuple[str, ApiKey],
    ):
        """Test project list pagination."""
        raw_key, _ = org_level_api_key

        # Create additional projects
        for i in range(5):
            project = Project(
                org_id=test_org.id,
                name=f"Project {i}",
                slug=f"project-{i}",
            )
            db_session.add(project)
        await db_session.commit()

        # Get first page with 2 items
        response = await client.get(
            "/api/v1/projects?page=1&page_size=2",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] >= 5
        assert data["page"] == 1
        assert data["page_size"] == 2

    @pytest.mark.asyncio
    async def test_list_projects_no_auth(self, client: AsyncClient):
        """Test listing projects without API key fails."""
        response = await client.get("/api/v1/projects")

        assert response.status_code == 401


class TestCreateProject:
    """Tests for POST /api/v1/projects endpoint."""

    @pytest.mark.asyncio
    async def test_create_project_success(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
    ):
        """Test successful project creation."""
        raw_key, _ = org_level_api_key

        response = await client.post(
            "/api/v1/projects",
            json={
                "name": "New Project",
                "slug": "new-project",
                "description": "A new test project",
                "github_repo_owner": "test-owner",
                "github_repo_name": "test-repo",
                "default_branch": "main",
            },
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Project"
        assert data["slug"] == "new-project"
        assert data["description"] == "A new test project"
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_project_duplicate_slug(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test creating project with duplicate slug fails."""
        raw_key, _ = org_level_api_key

        response = await client.post(
            "/api/v1/projects",
            json={
                "name": "Duplicate Project",
                "slug": test_project.slug,  # Use existing slug
            },
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_project_no_auth(self, client: AsyncClient):
        """Test creating project without API key fails."""
        response = await client.post(
            "/api/v1/projects",
            json={"name": "Test", "slug": "test"},
        )

        assert response.status_code == 401


class TestGetProject:
    """Tests for GET /api/v1/projects/:id endpoint."""

    @pytest.mark.asyncio
    async def test_get_project_success(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test getting a project by ID."""
        raw_key, _ = org_level_api_key

        response = await client.get(
            f"/api/v1/projects/{test_project.id}",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_project.id
        assert data["name"] == test_project.name
        assert data["slug"] == test_project.slug

    @pytest.mark.asyncio
    async def test_get_project_not_found(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
    ):
        """Test getting non-existent project returns 404."""
        raw_key, _ = org_level_api_key

        response = await client.get(
            "/api/v1/projects/non-existent-id",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestUpdateProject:
    """Tests for PATCH /api/v1/projects/:id endpoint."""

    @pytest.mark.asyncio
    async def test_update_project_success(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test updating a project."""
        raw_key, _ = org_level_api_key

        response = await client.patch(
            f"/api/v1/projects/{test_project.id}",
            json={"name": "Updated Name", "description": "Updated description"},
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"
        # Slug should remain unchanged
        assert data["slug"] == test_project.slug

    @pytest.mark.asyncio
    async def test_update_project_not_found(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
    ):
        """Test updating non-existent project returns 404."""
        raw_key, _ = org_level_api_key

        response = await client.patch(
            "/api/v1/projects/non-existent-id",
            json={"name": "New Name"},
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 404


class TestDeleteProject:
    """Tests for DELETE /api/v1/projects/:id endpoint."""

    @pytest.mark.asyncio
    async def test_delete_project_success(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_org: Organization,
        org_level_api_key: tuple[str, ApiKey],
    ):
        """Test deleting a project."""
        raw_key, _ = org_level_api_key

        # Create a project to delete
        project = Project(
            org_id=test_org.id,
            name="Delete Me",
            slug="delete-me",
        )
        db_session.add(project)
        await db_session.commit()
        await db_session.refresh(project)
        project_id = project.id

        # Delete the project
        response = await client.delete(
            f"/api/v1/projects/{project_id}",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 204

        # Verify it's deleted
        get_response = await client.get(
            f"/api/v1/projects/{project_id}",
            headers={"X-API-Key": raw_key},
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_project_not_found(
        self,
        client: AsyncClient,
        org_level_api_key: tuple[str, ApiKey],
    ):
        """Test deleting non-existent project returns 404."""
        raw_key, _ = org_level_api_key

        response = await client.delete(
            "/api/v1/projects/non-existent-id",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 404
