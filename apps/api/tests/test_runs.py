"""Tests for the runs router."""

import pytest
from httpx import AsyncClient

from src.models import ApiKey, Project

from tests.conftest import make_run_payload


class TestCreateRun:
    """Tests for POST /api/v1/runs endpoint."""

    @pytest.mark.asyncio
    async def test_create_run_success(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test successful run creation."""
        raw_key, _ = test_api_key
        payload = make_run_payload(test_project.id)

        response = await client.post(
            "/api/v1/runs",
            json=payload,
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["status"] == "passed"
        assert data["pass_rate"] == 90.0  # Returned as percentage
        assert "dashboard_url" in data
        assert "summary" in data
        assert data["summary"]["total"] == 10
        assert data["summary"]["passed"] == 9
        assert data["summary"]["failed"] == 1

    @pytest.mark.asyncio
    async def test_create_run_failed_status(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test creating a run with failed status."""
        raw_key, _ = test_api_key
        payload = make_run_payload(test_project.id, status="failed")

        response = await client.post(
            "/api/v1/runs",
            json=payload,
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "failed"
        assert data["pass_rate"] == 50.0  # Returned as percentage

    @pytest.mark.asyncio
    async def test_create_run_no_auth(
        self,
        client: AsyncClient,
        test_project: Project,
    ):
        """Test run creation without API key fails."""
        payload = make_run_payload(test_project.id)

        response = await client.post("/api/v1/runs", json=payload)

        assert response.status_code == 401
        assert "API key required" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_run_invalid_api_key(
        self,
        client: AsyncClient,
        test_project: Project,
    ):
        """Test run creation with invalid API key fails."""
        payload = make_run_payload(test_project.id)

        response = await client.post(
            "/api/v1/runs",
            json=payload,
            headers={"X-API-Key": "rg_invalid_key_12345"},
        )

        assert response.status_code == 401
        assert "Invalid API key" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_run_wrong_project(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
    ):
        """Test run creation for non-existent project fails.

        When using a project-scoped API key, accessing a different project
        returns 403 Forbidden (not authorized for that project).
        """
        raw_key, _ = test_api_key
        payload = make_run_payload("non-existent-project-id")

        response = await client.post(
            "/api/v1/runs",
            json=payload,
            headers={"X-API-Key": raw_key},
        )

        # Project-scoped key returns 403 for other projects
        assert response.status_code == 403


class TestListRuns:
    """Tests for GET /api/v1/runs endpoint."""

    @pytest.mark.asyncio
    async def test_list_runs_empty(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test listing runs when none exist."""
        raw_key, _ = test_api_key

        response = await client.get(
            f"/api/v1/runs?project_id={test_project.id}",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1

    @pytest.mark.asyncio
    async def test_list_runs_with_data(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test listing runs after creating some."""
        raw_key, _ = test_api_key

        # Create a couple of runs
        for _ in range(3):
            payload = make_run_payload(test_project.id)
            await client.post(
                "/api/v1/runs",
                json=payload,
                headers={"X-API-Key": raw_key},
            )

        response = await client.get(
            f"/api/v1/runs?project_id={test_project.id}",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 3
        assert data["total"] == 3

    @pytest.mark.asyncio
    async def test_list_runs_pagination(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test run list pagination."""
        raw_key, _ = test_api_key

        # Create 5 runs
        for _ in range(5):
            payload = make_run_payload(test_project.id)
            await client.post(
                "/api/v1/runs",
                json=payload,
                headers={"X-API-Key": raw_key},
            )

        # Get first page with 2 items
        response = await client.get(
            f"/api/v1/runs?project_id={test_project.id}&page=1&page_size=2",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total_pages"] == 3

    @pytest.mark.asyncio
    async def test_list_runs_no_auth(
        self,
        client: AsyncClient,
        test_project: Project,
    ):
        """Test listing runs without API key fails."""
        response = await client.get(f"/api/v1/runs?project_id={test_project.id}")

        assert response.status_code == 401


class TestGetRun:
    """Tests for GET /api/v1/runs/:id endpoint."""

    @pytest.mark.asyncio
    async def test_get_run_success(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
        test_project: Project,
    ):
        """Test getting a specific run by ID."""
        raw_key, _ = test_api_key

        # Create a run
        payload = make_run_payload(test_project.id)
        create_response = await client.post(
            "/api/v1/runs",
            json=payload,
            headers={"X-API-Key": raw_key},
        )
        run_id = create_response.json()["id"]

        # Get the run
        response = await client.get(
            f"/api/v1/runs/{run_id}",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == run_id
        assert data["status"] == "passed"
        assert data["total_cases"] == 10
        assert data["passed_cases"] == 9
        assert data["failed_cases"] == 1
        assert "results" in data
        assert len(data["results"]) == 10

    @pytest.mark.asyncio
    async def test_get_run_not_found(
        self,
        client: AsyncClient,
        test_api_key: tuple[str, ApiKey],
    ):
        """Test getting non-existent run returns 404."""
        raw_key, _ = test_api_key

        response = await client.get(
            "/api/v1/runs/non-existent-run-id",
            headers={"X-API-Key": raw_key},
        )

        assert response.status_code == 404
        assert "Run not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_run_no_auth(
        self,
        client: AsyncClient,
    ):
        """Test getting a run without API key fails."""
        response = await client.get("/api/v1/runs/some-run-id")

        assert response.status_code == 401


class TestHealthEndpoints:
    """Tests for health and root endpoints."""

    @pytest.mark.asyncio
    async def test_root_endpoint(self, client: AsyncClient):
        """Test root endpoint returns app info."""
        response = await client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "docs" in data

    @pytest.mark.asyncio
    async def test_health_endpoint(self, client: AsyncClient):
        """Test health endpoint returns healthy status."""
        response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
