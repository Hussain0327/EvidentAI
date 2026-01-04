"""Test fixtures for the EvidentAI API tests."""

import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base, get_db
from src.main import app
from src.models import ApiKey, Organization, Project, User
from src.utils.security import generate_api_key


# Test database URL - use in-memory SQLite
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def test_org(db_session: AsyncSession) -> Organization:
    """Create a test organization."""
    org = Organization(
        id=str(uuid4()),
        name="Test Organization",
        slug="test-org",
        plan="pro",
    )
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    return org


@pytest_asyncio.fixture(scope="function")
async def test_user(db_session: AsyncSession, test_org: Organization) -> User:
    """Create a test user."""
    user = User(
        id=str(uuid4()),
        org_id=test_org.id,
        email="test@example.com",
        name="Test User",
        role="admin",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture(scope="function")
async def test_project(db_session: AsyncSession, test_org: Organization) -> Project:
    """Create a test project."""
    project = Project(
        id=str(uuid4()),
        org_id=test_org.id,
        name="Test Project",
        slug="test-project",
        description="A test project for testing",
        github_repo_owner="test-owner",
        github_repo_name="test-repo",
        default_branch="main",
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project


@pytest_asyncio.fixture(scope="function")
async def test_api_key(
    db_session: AsyncSession, test_org: Organization, test_project: Project
) -> tuple[str, ApiKey]:
    """Create a test API key. Returns (raw_key, api_key_model)."""
    raw_key, key_hash, key_prefix = generate_api_key()

    api_key = ApiKey(
        id=str(uuid4()),
        org_id=test_org.id,
        project_id=test_project.id,
        name="Test API Key",
        key_hash=key_hash,
        key_prefix=key_prefix,
        created_by=None,
    )
    db_session.add(api_key)
    await db_session.commit()
    await db_session.refresh(api_key)
    return raw_key, api_key


@pytest_asyncio.fixture(scope="function")
async def org_level_api_key(
    db_session: AsyncSession, test_org: Organization
) -> tuple[str, ApiKey]:
    """Create an org-level API key (no project restriction)."""
    raw_key, key_hash, key_prefix = generate_api_key()

    api_key = ApiKey(
        id=str(uuid4()),
        org_id=test_org.id,
        project_id=None,  # Org-level key
        name="Org API Key",
        key_hash=key_hash,
        key_prefix=key_prefix,
        created_by=None,
    )
    db_session.add(api_key)
    await db_session.commit()
    await db_session.refresh(api_key)
    return raw_key, api_key


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with database override."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def auth_client(
    client: AsyncClient, test_api_key: tuple[str, ApiKey]
) -> tuple[AsyncClient, str]:
    """Return client and API key for authenticated requests."""
    raw_key, _ = test_api_key
    return client, raw_key


# Helper functions for creating test data


def make_run_payload(project_id: str, status: str = "passed") -> dict:
    """Create a valid run payload for testing.

    Matches the RunCreate schema which expects:
    - SuiteResultCreate with 'name' and 'cases' fields
    - TestCaseResultCreate with single 'evaluator' and 'evaluator_result'
    - MetricsCreate with specific fields
    """
    now = datetime.now(timezone.utc).isoformat()
    passed_count = 9 if status == "passed" else 5
    failed_count = 1 if status == "passed" else 5
    pass_rate = 0.9 if status == "passed" else 0.5

    return {
        "project_id": project_id,
        "git": {
            "sha": "abc123def456789012345678901234567890",
            "ref": "refs/heads/main",
            "message": "Test commit message",
            "pr_number": None,
        },
        "config_hash": "sha256:test_config_hash_12345",
        "started_at": now,
        "finished_at": now,
        "duration_ms": 5000,
        "status": status,
        "total": 10,
        "passed": passed_count,
        "failed": failed_count,
        "pass_rate": pass_rate,
        "suites": [
            {
                "name": "test-suite",
                "total": 10,
                "passed": passed_count,
                "failed": failed_count,
                "pass_rate": pass_rate,
                "cases": [
                    {
                        "name": f"test-case-{i}",
                        "input": f"Test query {i}",
                        "output": f"Test response {i}",
                        "passed": i < passed_count,
                        "score": 0.95 if i < passed_count else 0.3,
                        "evaluator": "contains",
                        "evaluator_result": {
                            "passed": i < passed_count,
                            "score": 0.95 if i < passed_count else 0.3,
                            "reason": "Test passed" if i < passed_count else "Test failed",
                            "details": {"matched": i < passed_count},
                        },
                        "latency_ms": 100 + i * 10,
                        "tokens_used": 150,
                        "cost_usd": 0.001,
                    }
                    for i in range(10)
                ],
            }
        ],
        "metrics": {
            "pii_detected": 0,
            "prompt_injection_attempts": 0,
            "avg_latency_ms": 150.5,
            "total_tokens": 1500,
            "total_cost_usd": 0.01,
        },
        "thresholds_met": status == "passed",
        "threshold_violations": [] if status == "passed" else ["pass_rate < 0.8"],
    }
