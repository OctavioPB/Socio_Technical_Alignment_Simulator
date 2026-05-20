"""Root pytest configuration — shared fixtures across all test suites."""

import pytest


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"
