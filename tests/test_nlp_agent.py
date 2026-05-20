"""Tests for apps/api/services/nlp_agent.py.

Uses pytest-mock to stub the Anthropic AsyncAnthropic client and
redis.asyncio so tests run without live external dependencies.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from apps.api.models.graph_models import (
    CandidateProfile,
    CollaborationVector,
    SkillWithProficiency,
)
from apps.api.services.nlp_agent import (
    CANDIDATE_EXTRACTION_PROMPT,
    _EXTRACT_TOOL,
    _KNOWN_SKILLS,
    _make_cache_key,
    extract_candidate_profile,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

_GITHUB_URL = "https://github.com/tiangolo/fastapi"
_CANDIDATE_ID = "cand_test001"

_TOOL_INPUT: dict = {
    "skills": [
        {"skill": "python", "proficiency": "expert", "evidence": "Primary language across all modules."},
        {"skill": "fastapi", "proficiency": "expert", "evidence": "Framework author; entire repo is the library."},
        {"skill": "pydantic", "proficiency": "advanced", "evidence": "Heavily used for request/response validation."},
        {"skill": "pytest", "proficiency": "advanced", "evidence": "Comprehensive test suite with fixtures."},
        {"skill": "docker", "proficiency": "intermediate", "evidence": "Dockerfile and docker-compose in repo root."},
    ],
    "collaboration_vector": {
        "async_preference": 0.8,
        "pr_review_depth": 0.7,
        "documentation_habit": 0.95,
        "pairing_affinity": 0.3,
        "mentoring_tendency": 0.85,
    },
    "domain_expertise": ["backend", "api design", "developer tooling"],
    "graph_position_estimate": "knowledge hub",
    "extraction_summary": (
        "Senior backend engineer with deep Python and FastAPI expertise. "
        "Strong documentation and mentoring signals. Likely to become a "
        "knowledge hub in backend-heavy teams."
    ),
}


def _make_mock_claude_response(tool_input: dict) -> MagicMock:
    """Build a mock Anthropic response object with a single tool_use block."""
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.input = tool_input

    response = MagicMock()
    response.content = [tool_block]
    return response


@pytest.fixture
def mock_github(mocker):
    """Stub _fetch_github_context so tests don't hit the real GitHub API."""
    return mocker.patch(
        "apps.api.services.nlp_agent._fetch_github_context",
        new_callable=AsyncMock,
        return_value=(
            "Repository: tiangolo/fastapi\n"
            "Description: FastAPI framework, high performance\n"
            "Languages: Python\n"
            "README:\n# FastAPI\nModern, fast web framework for building APIs."
        ),
    )


@pytest.fixture
def mock_redis_miss(mocker):
    """Redis always returns None (cache miss)."""
    mocker.patch(
        "apps.api.services.nlp_agent._load_cached_profile",
        new_callable=AsyncMock,
        return_value=None,
    )
    mocker.patch(
        "apps.api.services.nlp_agent._cache_profile",
        new_callable=AsyncMock,
    )


@pytest.fixture
def mock_redis_hit(mocker):
    """Redis returns a pre-built CandidateProfile (cache hit)."""
    cached = CandidateProfile(
        candidate_id=_CANDIDATE_ID,
        github_url=_GITHUB_URL,
        skills=[SkillWithProficiency(skill="python", proficiency="expert", evidence="cached")],
        collaboration_vector=CollaborationVector(
            async_preference=0.5,
            pr_review_depth=0.5,
            documentation_habit=0.5,
            pairing_affinity=0.5,
            mentoring_tendency=0.5,
        ),
        domain_expertise=["backend"],
        graph_position_estimate="domain specialist",
        extraction_summary="Cached profile.",
        extracted_at=datetime.utcnow(),
    )
    mocker.patch(
        "apps.api.services.nlp_agent._load_cached_profile",
        new_callable=AsyncMock,
        return_value=cached,
    )
    return cached


# ── Unit tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_returns_candidate_profile(mocker, mock_github, mock_redis_miss):
    """Happy path: Claude returns valid tool input → CandidateProfile built."""
    mock_response = _make_mock_claude_response(_TOOL_INPUT)

    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)

    assert isinstance(profile, CandidateProfile)
    assert profile.candidate_id == _CANDIDATE_ID
    assert profile.github_url == _GITHUB_URL


@pytest.mark.asyncio
async def test_skills_extracted_correctly(mocker, mock_github, mock_redis_miss):
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)

    skill_names = [s.skill for s in profile.skills]
    assert "python" in skill_names
    assert "fastapi" in skill_names
    assert profile.skills[0].proficiency in {"beginner", "intermediate", "advanced", "expert"}


@pytest.mark.asyncio
async def test_collaboration_vector_range(mocker, mock_github, mock_redis_miss):
    """All collaboration vector dimensions must be in [0, 1]."""
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)
    vec = profile.collaboration_vector

    for dim in vec.as_list():
        assert 0.0 <= dim <= 1.0


@pytest.mark.asyncio
async def test_collaboration_vector_as_list_length(mocker, mock_github, mock_redis_miss):
    """as_list() must always return exactly 5 floats."""
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)
    assert len(profile.collaboration_vector.as_list()) == 5


@pytest.mark.asyncio
async def test_domain_expertise_non_empty(mocker, mock_github, mock_redis_miss):
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)
    assert len(profile.domain_expertise) >= 1


@pytest.mark.asyncio
async def test_graph_position_valid_value(mocker, mock_github, mock_redis_miss):
    valid_positions = {
        "knowledge hub",
        "cross-team connector",
        "domain specialist",
        "emerging contributor",
        "generalist",
    }
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)
    assert profile.graph_position_estimate in valid_positions


@pytest.mark.asyncio
async def test_cache_hit_skips_claude(mocker, mock_redis_hit):
    """If Redis has a cached profile, Claude API must not be called."""
    call_claude = mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)

    call_claude.assert_not_called()
    assert profile.candidate_id == _CANDIDATE_ID


@pytest.mark.asyncio
async def test_cache_hit_returns_cached_skills(mocker, mock_redis_hit):
    cached = mock_redis_hit
    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)
    assert profile.skills[0].skill == cached.skills[0].skill


@pytest.mark.asyncio
async def test_transcript_included_in_request(mocker, mock_github, mock_redis_miss):
    """Transcript content must be appended to the user message."""
    transcript = "Candidate discussed distributed systems and mentoring junior engineers."
    captured: list[str] = []

    async def _capture_call(user_content: str) -> dict:
        captured.append(user_content)
        return _TOOL_INPUT

    mocker.patch("apps.api.services.nlp_agent._call_claude", side_effect=_capture_call)

    await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID, transcript=transcript)

    assert len(captured) == 1
    assert "Interview Transcript" in captured[0]
    assert transcript[:50] in captured[0]


@pytest.mark.asyncio
async def test_transcript_hash_set_when_provided(mocker, mock_github, mock_redis_miss):
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    transcript = "Some interview content."
    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID, transcript=transcript)

    assert profile.transcript_hash is not None
    expected_hash = hashlib.sha256(transcript.encode()).hexdigest()[:16]
    assert profile.transcript_hash == expected_hash


@pytest.mark.asyncio
async def test_no_transcript_hash_is_none(mocker, mock_github, mock_redis_miss):
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)
    assert profile.transcript_hash is None


@pytest.mark.asyncio
async def test_to_candidate_insert_strips_proficiency(mocker, mock_github, mock_redis_miss):
    mocker.patch(
        "apps.api.services.nlp_agent._call_claude",
        new_callable=AsyncMock,
        return_value=_TOOL_INPUT,
    )

    profile = await extract_candidate_profile(_GITHUB_URL, _CANDIDATE_ID)
    insert = profile.to_candidate_insert(name="Alice", team_id="team_eng")

    assert insert.name == "Alice"
    assert insert.team_id == "team_eng"
    assert all(isinstance(s, str) for s in insert.skills)
    assert len(insert.collaboration_vector) == 5


# ── Tool definition tests ──────────────────────────────────────────────────────

def test_extract_tool_has_required_fields():
    schema = _EXTRACT_TOOL["input_schema"]
    required = set(schema["required"])
    assert "skills" in required
    assert "collaboration_vector" in required
    assert "domain_expertise" in required
    assert "graph_position_estimate" in required
    assert "extraction_summary" in required


def test_extract_tool_collab_vector_has_five_dims():
    cv_props = _EXTRACT_TOOL["input_schema"]["properties"]["collaboration_vector"]["properties"]
    assert set(cv_props.keys()) == {
        "async_preference",
        "pr_review_depth",
        "documentation_habit",
        "pairing_affinity",
        "mentoring_tendency",
    }


def test_graph_position_enum_matches_model():
    tool_enum = set(
        _EXTRACT_TOOL["input_schema"]["properties"]["graph_position_estimate"]["enum"]
    )
    model_enum = {
        "knowledge hub",
        "cross-team connector",
        "domain specialist",
        "emerging contributor",
        "generalist",
    }
    assert tool_enum == model_enum


# ── Skill taxonomy tests ───────────────────────────────────────────────────────

def test_known_skills_non_empty():
    assert len(_KNOWN_SKILLS) > 50


def test_known_skills_contains_core_techs():
    for tech in ("python", "typescript", "docker", "postgresql", "redis"):
        assert tech in _KNOWN_SKILLS


def test_known_skills_all_lowercase():
    assert all(s == s.lower() for s in _KNOWN_SKILLS)


# ── Cache key tests ────────────────────────────────────────────────────────────

def test_cache_key_deterministic():
    k1 = _make_cache_key("https://github.com/a/b", "abc123")
    k2 = _make_cache_key("https://github.com/a/b", "abc123")
    assert k1 == k2


def test_cache_key_differs_by_url():
    k1 = _make_cache_key("https://github.com/a/b", "abc123")
    k2 = _make_cache_key("https://github.com/x/y", "abc123")
    assert k1 != k2


def test_cache_key_differs_by_transcript():
    k1 = _make_cache_key("https://github.com/a/b", "abc123")
    k2 = _make_cache_key("https://github.com/a/b", "xyz789")
    assert k1 != k2


def test_cache_key_has_stas_prefix():
    key = _make_cache_key("https://github.com/a/b", "abc")
    assert key.startswith("stas:nlp:")


# ── System prompt tests ────────────────────────────────────────────────────────

def test_system_prompt_non_empty():
    assert len(CANDIDATE_EXTRACTION_PROMPT) > 200


def test_system_prompt_references_tool():
    assert "extract_candidate_profile" in CANDIDATE_EXTRACTION_PROMPT


def test_system_prompt_covers_all_collab_dims():
    for dim in (
        "async_preference",
        "pr_review_depth",
        "documentation_habit",
        "pairing_affinity",
        "mentoring_tendency",
    ):
        assert dim in CANDIDATE_EXTRACTION_PROMPT
