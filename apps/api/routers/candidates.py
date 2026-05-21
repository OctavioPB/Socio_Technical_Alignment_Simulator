"""FastAPI /candidates router.

POST /candidates/extract          — run NLP extraction; cache profile
GET  /candidates/                 — list all extracted candidates
GET  /candidates/{candidate_id}   — retrieve one profile by ID
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

import anthropic as _anthropic

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from apps.api.core.config import settings
from apps.api.core.rate_limit import EXTRACT_LIMIT, limiter
from apps.api.models.graph_models import CandidateProfile
from apps.api.services.nlp_agent import extract_candidate_profile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/candidates", tags=["candidates"])

_CANDIDATE_TTL = 86_400 * 7   # 7 days
_CANDIDATE_KEY = "stas:candidate:{}"
_CANDIDATE_INDEX = "stas:candidate_ids"


# ── Redis helper (same pattern as simulation_engine.py) ───────────────────────


async def _redis():
    """Return a redis.asyncio client, or None if Redis is unavailable."""
    try:
        import redis.asyncio as aioredis  # type: ignore[import]

        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        return client
    except Exception:
        logger.warning("Redis unavailable — candidate profiles will not be persisted.")
        return None


# ── Request model ─────────────────────────────────────────────────────────────


class ExtractRequest(BaseModel):
    github_url: str = Field(..., description="Public GitHub repository URL")
    candidate_id: str = Field(
        default_factory=lambda: f"cand_{uuid.uuid4().hex[:10]}",
        description="Optional stable identifier; auto-generated if omitted",
    )
    transcript: str | None = Field(
        default=None,
        description="Optional interview transcript text (plain text, max ~8 000 chars)",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/extract",
    response_model=CandidateProfile,
    status_code=status.HTTP_200_OK,
    summary="Extract a candidate profile via the NLP agent",
)
@limiter.limit(EXTRACT_LIMIT)
async def extract(request: Request, body: ExtractRequest) -> CandidateProfile:
    """Analyse a GitHub repository (and optional interview transcript) with the
    Claude NLP agent and return a structured CandidateProfile.

    Results are cached in Redis for 7 days.  Subsequent requests with the same
    GitHub URL + transcript will be served from cache without calling Claude.
    """
    try:
        profile = await extract_candidate_profile(
            github_url=body.github_url,
            candidate_id=body.candidate_id,
            transcript=body.transcript,
        )
    except _anthropic.AuthenticationError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY in .env.",
        )
    except _anthropic.APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Claude API error: {exc}",
        )
    except Exception as exc:
        logger.exception("Unexpected error during candidate extraction")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction failed: {exc}",
        )

    # Persist profile for later retrieval by candidate_id
    client = await _redis()
    if client is not None:
        try:
            await client.setex(
                _CANDIDATE_KEY.format(profile.candidate_id),
                _CANDIDATE_TTL,
                profile.model_dump_json(),
            )
            await client.sadd(_CANDIDATE_INDEX, profile.candidate_id)
        except Exception as exc:
            logger.warning("Failed to persist candidate profile: %s", exc)
        finally:
            await client.aclose()

    return profile


@router.get(
    "/",
    response_model=list[CandidateProfile],
    summary="List all extracted candidate profiles",
)
async def list_candidates(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[CandidateProfile]:
    """Return the most recently extracted candidate profiles (newest first).

    Profiles are stored in Redis; this endpoint returns up to `limit` results.
    Returns an empty list if Redis is unavailable.
    """
    client = await _redis()
    if client is None:
        return []

    try:
        ids: set[str] = await client.smembers(_CANDIDATE_INDEX)
        profiles: list[CandidateProfile] = []
        for cid in list(ids)[:limit]:
            raw = await client.get(_CANDIDATE_KEY.format(cid))
            if raw:
                try:
                    profiles.append(CandidateProfile.model_validate_json(raw))
                except Exception:
                    pass
        # Sort newest first by extracted_at
        profiles.sort(key=lambda p: p.extracted_at, reverse=True)
        return profiles[:limit]
    except Exception as exc:
        logger.warning("Failed to list candidates: %s", exc)
        return []
    finally:
        await client.aclose()


@router.get(
    "/{candidate_id}",
    response_model=CandidateProfile,
    summary="Retrieve a candidate profile by ID",
)
async def get_candidate(candidate_id: str) -> CandidateProfile:
    """Fetch a previously extracted candidate profile from Redis.

    Profiles expire after 7 days.
    """
    client = await _redis()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis unavailable — cannot retrieve candidate profile.",
        )

    try:
        raw = await client.get(_CANDIDATE_KEY.format(candidate_id))
    finally:
        await client.aclose()

    if not raw:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate '{candidate_id}' not found or has expired.",
        )

    return CandidateProfile.model_validate_json(raw)
